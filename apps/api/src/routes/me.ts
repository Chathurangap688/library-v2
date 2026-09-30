/** Lesson 3.2: GET /api/me — who am I? (the React app asks this first) */
import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import type { AppEnv } from '../types'
import { problem } from '../lib/problem'
import { validationHook } from '../lib/validate'
import { Me, problemResponse } from '../lib/schemas'

export const meRoutes = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })

meRoutes.openapi(createRoute({
  method: 'get', path: '/me', tags: ['Account'], operationId: 'getMe',
  summary: 'The signed-in user (also for pending accounts)',
  responses: {
    200: { description: 'Signed in', content: { 'application/json': { schema: Me } } },
    401: problemResponse('Not signed in'),
  },
}), (c) => {
  const user = c.get('user')
  if (!user) return problem(c, 401, 'Please sign in')
  return c.json(user, 200)
})
