/**
 * Lesson 3.3: admin-only user management. The whole router sits behind requireAdmin
 * (see app.ts), so every route here can trust c.get('user') is an active admin.
 *
 *   GET    /api/admin/users        everyone, pending first
 *   PATCH  /api/admin/users/{id}   { status } activate / deactivate · { role } make / remove admin
 *   DELETE /api/admin/users/{id}   remove a user (and their reading list + ratings)
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { asc, desc, eq, sql } from 'drizzle-orm'
import type { AppEnv } from '../types'
import { users } from '../db/schema'
import { problem } from '../lib/problem'
import { validationHook } from '../lib/validate'
import { audit } from '../lib/audit'
import { AdminUser, UpdateUser, UserIdParam, problemResponse } from '../lib/schemas'

export const adminRoutes = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })

const adminUserColumns = {
  id: users.id, email: users.email, name: users.name, picture: users.picture,
  role: users.role, status: users.status, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt,
  linked: sql<boolean>`${users.sub} is not null`,
  readCount: sql<number>`(select count(*) from reading_status r where r.user_id = users.id and r.status = 'read')::int`,
  openLoans: sql<number>`(select count(*) from loans l where l.user_id = users.id and l.returned_at is null)::int`,
}
const secured = { security: [{ sessionCookie: [] }], tags: ['Admin'] }
const adminErrors = { 401: problemResponse('Not signed in'), 403: problemResponse('Not an admin') }

adminRoutes.openapi(createRoute({
  ...secured, method: 'get', path: '/users', operationId: 'adminListUsers', summary: 'All users (pending first)',
  responses: { 200: { description: 'Users', content: { 'application/json': { schema: z.array(AdminUser) } } }, ...adminErrors },
}), async (c) => {
  const rows = await c.get('db').select(adminUserColumns).from(users)
    .orderBy(sql`${users.status} = 'pending' desc`, desc(users.role), asc(users.name))
  return c.json(rows, 200)
})

adminRoutes.openapi(createRoute({
  ...secured, method: 'patch', path: '/users/{id}', operationId: 'adminUpdateUser',
  summary: 'Activate / deactivate a user, or change their role',
  request: { params: UserIdParam, body: { content: { 'application/json': { schema: UpdateUser } }, required: true } },
  responses: {
    200: { description: 'Updated user', content: { 'application/json': { schema: AdminUser } } },
    400: problemResponse('Invalid body'), ...adminErrors,
    404: problemResponse('No such user'), 409: problemResponse('Not allowed on your own account'),
  },
}), async (c) => {
  const { id } = c.req.valid('param')
  const change = c.req.valid('json')
  const me = c.get('user')!
  const db = c.get('db')

  // Safety: an admin cannot lock themselves out (so the library never loses its last admin)
  if (id === me.id && (change.role === 'user' || change.status === 'pending')) {
    return problem(c, 409, 'You cannot remove your own admin role or deactivate yourself')
  }
  const [before] = await db.select({ role: users.role, status: users.status }).from(users).where(eq(users.id, id))
  if (!before) return problem(c, 404, `No user with id ${id}`)

  await db.update(users).set(change).where(eq(users.id, id))
  const [after] = await db.select(adminUserColumns).from(users).where(eq(users.id, id))

  if (change.status && change.status !== before.status) await audit(db, me.id, `user.${change.status === 'active' ? 'activate' : 'deactivate'}`, 'user', id, { email: after.email })
  if (change.role && change.role !== before.role) await audit(db, me.id, 'user.role', 'user', id, { email: after.email, from: before.role, to: change.role })
  return c.json(after, 200)
})

adminRoutes.openapi(createRoute({
  ...secured, method: 'delete', path: '/users/{id}', operationId: 'adminDeleteUser',
  summary: 'Remove a user (their reading list and ratings go too)',
  request: { params: UserIdParam },
  responses: {
    204: { description: 'Removed' }, ...adminErrors,
    404: problemResponse('No such user'), 409: problemResponse('Yourself, or the user still has books on loan'),
  },
}), async (c) => {
  const { id } = c.req.valid('param')
  const me = c.get('user')!
  const db = c.get('db')
  if (id === me.id) return problem(c, 409, 'You cannot remove your own account')

  const [target] = await db.select(adminUserColumns).from(users).where(eq(users.id, id))
  if (!target) return problem(c, 404, `No user with id ${id}`)
  // Deleting would also delete their loan records — make the admin mark the books returned first
  if (target.openLoans > 0) return problem(c, 409, `${target.name ?? target.email} still has ${target.openLoans} book(s) on loan`)

  await db.delete(users).where(eq(users.id, id))   // reading_status + ratings follow (ON DELETE CASCADE)
  await audit(db, me.id, 'user.delete', 'user', id, { email: target.email, name: target.name })
  // Their session cookie stops working at once: loadUser finds no user → treated as signed out
  return c.body(null, 204)
})
