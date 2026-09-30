/**
 * Lesson 3.2: link the person Asgardeo signed in to a row in OUR users table.
 *   1. already linked?          → find by `sub` (Asgardeo's permanent user id)
 *   2. imported from v1?        → find by email, then remember their `sub`
 *   3. brand new                → create as PENDING (an admin must activate them)
 * Asgardeo answers "who is this?"; our database answers "what may they do?".
 */
import { eq, sql } from 'drizzle-orm'
import type { IDToken } from 'oauth4webapi'
import type { Db } from '../db/client'
import { users } from '../db/schema'
import type { Bindings, SessionUser } from '../types'

const userColumns = {
  id: users.id, email: users.email, name: users.name, picture: users.picture, role: users.role, status: users.status,
}

export async function upsertUserFromClaims(db: Db, env: Bindings, claims: IDToken): Promise<SessionUser> {
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : ''
  if (!email) throw new Error('Asgardeo did not send an email address (check the app\'s User Attributes)')
  const name = typeof claims.name === 'string' ? claims.name
    : [claims.given_name, claims.family_name].filter((p) => typeof p === 'string' && p).join(' ') || null
  const picture = typeof claims.picture === 'string' ? claims.picture : null
  const isBootstrapAdmin = (env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).includes(email)

  const [bySub] = await db.select({ id: users.id }).from(users).where(eq(users.sub, claims.sub))
  const [byEmail] = bySub ? [] : await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`)
  const existing = bySub ?? byEmail

  const changes = {
    sub: claims.sub, email, lastLoginAt: new Date(),
    ...(name ? { name } : {}), ...(picture ? { picture } : {}),
    ...(isBootstrapAdmin ? { role: 'admin' as const, status: 'active' as const } : {}),
  }
  const [row] = existing
    ? await db.update(users).set(changes).where(eq(users.id, existing.id)).returning(userColumns)
    : await db.insert(users).values({ ...changes, status: isBootstrapAdmin ? 'active' : 'pending' }).returning(userColumns)
  return row
}

export async function findUser(db: Db, id: string): Promise<SessionUser | null> {
  const [row] = await db.select(userColumns).from(users).where(eq(users.id, id))
  return row ?? null
}
