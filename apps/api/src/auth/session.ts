/**
 * Lesson 3.2: OUR session — what the browser keeps after login.
 * The browser gets only a random id in an HttpOnly cookie (JavaScript cannot read it,
 * so an XSS bug cannot steal it). KV stores the session under the SHA-256 of that id,
 * so even someone who reads KV cannot use the stored keys as cookies.
 */
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv, Bindings } from '../types'

export const SESSION_DAYS = 30
export type StoredSession = { userId: string; idToken?: string; createdAt: string }

const secure = (env: Bindings) => env.APP_ORIGIN.startsWith('https://')
// "__Host-" = browser guarantees: Secure, Path=/, no Domain (can't be set by a sub-domain)
export const cookieName = (env: Bindings) => (secure(env) ? '__Host-session' : 'session')
const LOGIN_COOKIE = 'login_state'

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function sha256(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
const kvKey = async (id: string) => `session:${await sha256(id)}`

export async function createSession(c: Context<AppEnv>, data: Omit<StoredSession, 'createdAt'>) {
  const id = randomId()
  const value: StoredSession = { ...data, createdAt: new Date().toISOString() }
  await c.env.SESSIONS.put(await kvKey(id), JSON.stringify(value), { expirationTtl: SESSION_DAYS * 86400 })
  setCookie(c, cookieName(c.env), id, {
    httpOnly: true, secure: secure(c.env), sameSite: 'Strict', path: '/', maxAge: SESSION_DAYS * 86400,
  })
}

export async function readSession(c: Context<AppEnv>) {
  const id = getCookie(c, cookieName(c.env))
  if (!id) return null
  const value = await c.env.SESSIONS.get<StoredSession>(await kvKey(id), 'json')
  return value ? { id, ...value } : null
}

export async function destroySession(c: Context<AppEnv>, id: string) {
  await c.env.SESSIONS.delete(await kvKey(id))
  deleteCookie(c, cookieName(c.env), { path: '/', secure: secure(c.env) })
}

// ---- the short-lived "login in progress" record (state, nonce, PKCE verifier) ----
export type PendingLogin = { nonce: string; codeVerifier: string; returnTo: string }

export async function savePendingLogin(c: Context<AppEnv>, state: string, data: PendingLogin) {
  await c.env.SESSIONS.put(`login:${state}`, JSON.stringify(data), { expirationTtl: 600 })   // 10 minutes
  // Lax (not Strict): the browser must send it when Asgardeo redirects back (a cross-site navigation)
  setCookie(c, LOGIN_COOKIE, state, { httpOnly: true, secure: secure(c.env), sameSite: 'Lax', path: '/auth', maxAge: 600 })
}

export async function takePendingLogin(c: Context<AppEnv>, state: string | undefined) {
  const cookieState = getCookie(c, LOGIN_COOKIE)
  deleteCookie(c, LOGIN_COOKIE, { path: '/auth', secure: secure(c.env) })
  if (!state || state !== cookieState) return null        // started in another browser, or forged
  const key = `login:${state}`
  const data = await c.env.SESSIONS.get<PendingLogin>(key, 'json')
  if (data) await c.env.SESSIONS.delete(key)              // single use
  return data
}
