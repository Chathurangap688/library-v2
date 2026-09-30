/**
 * Lesson 3.2: middleware that runs before the API routes.
 *   loadUser      — if the session cookie is valid, c.get('user') = the user (else null)
 *   requireActive — 401 if not signed in, 403 if the account is still pending
 *   requireAdmin  — 403 unless the user is an admin
 * The role and status are read from the DATABASE on every request, so when an admin
 * activates someone, it works on their very next click — no new login needed.
 */
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'
import { problem } from '../lib/problem'
import { readSession } from './session'
import { findUser } from './users'

export const loadUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await readSession(c)
  c.set('sessionId', session?.id ?? null)
  c.set('user', session ? await findUser(c.get('db'), session.userId) : null)
  await next()
})

export const requireActive = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('user')
  if (!user) return problem(c, 401, 'Please sign in')
  if (user.status !== 'active') return problem(c, 403, 'Your account is waiting for an admin to activate it', { code: 'PENDING' })
  await next()
})

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('user')
  if (!user) return problem(c, 401, 'Please sign in')
  if (user.role !== 'admin' || user.status !== 'active') return problem(c, 403, 'Only admins can do this')
  await next()
})
