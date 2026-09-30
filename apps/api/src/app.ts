/**
 * Lesson 2.1 + 2.2: the whole Worker app, built by a function.
 * `makeDb` is passed in (dependency injection) so tests can use a different database
 * driver than production — the routes do not care where `c.get('db')` comes from.
 *
 *   /api/*             → our API
 *   /api/openapi.json  → the API contract (generated from the Zod schemas)
 *   /api/docs          → interactive docs (Swagger UI)
 *   /auth/*            → Lesson 3.2: sign in / out with Asgardeo (BFF)
 *   /*                 → the React app from GitHub Pages
 */
import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { secureHeaders } from 'hono/secure-headers'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { sql } from 'drizzle-orm'
import type { AppEnv, Bindings } from './types'
import type { Db } from './db/client'
import { problem } from './lib/problem'
import { validationHook } from './lib/validate'
import { DbHealth, Health } from './lib/schemas'
import { bookRoutes } from './routes/books'
import { metaRoutes } from './routes/meta'
import { authRoutes } from './routes/auth'
import { meRoutes } from './routes/me'
import { adminRoutes } from './routes/admin'
import { readingRoutes } from './routes/reading'
import { loadUser, requireActive, requireAdmin } from './auth/guards'
import { cookieName } from './auth/session'

// The "info" part of the OpenAPI document (also used by scripts/openapi.ts)
export const openApiInfo = {
  openapi: '3.1.0',
  info: {
    title: 'My Library API',
    version: '0.2.0',
    description: 'Books, categories and ratings of the home library. Errors use RFC 9457 Problem Details.',
  },
  servers: [{ url: 'https://library.bmcpthilakawansha.workers.dev', description: 'production' },
    { url: 'http://localhost:8787', description: 'local wrangler dev' }],
}

export function buildApp(makeDb: (env: Bindings) => Db) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })

  app.use('*', secureHeaders())

  // Lesson 3.2: a POST/PUT/DELETE from a page on another site is refused (CSRF protection)
  app.use('*', csrf({ origin: (origin, c) => origin === c.env.APP_ORIGIN }))

  // Give every API/auth request its own database handle (c.get('db')) and the signed-in user (c.get('user'))
  for (const path of ['/api/*', '/auth/*']) {
    app.use(path, async (c, next) => {
      c.set('db', makeDb(c.env))
      await next()
    })
    app.use(path, loadUser)
  }

  // Lesson 3.2: the library is private — books and lists need an ACTIVE account
  app.use('/api/books/*', requireActive)
  app.use('/api/books', requireActive)
  app.use('/api/categories', requireActive)
  app.use('/api/languages', requireActive)
  app.use('/api/me/shelves', requireActive)     // Lesson 4.1 (/api/books/* is already covered)
  // Lesson 3.3: everything under /api/admin is for admins only
  app.use('/api/admin/*', requireAdmin)

  // ---- API ----
  app.openapi(createRoute({
    method: 'get', path: '/api/health', tags: ['Health'], operationId: 'health', summary: 'Is the API up?',
    responses: { 200: { description: 'Up', content: { 'application/json': { schema: Health } } } },
  }), (c) => c.json({ ok: true, service: 'library-api', time: new Date().toISOString() }, 200))

  app.openapi(createRoute({
    method: 'get', path: '/api/health/db', tags: ['Health'], operationId: 'healthDb', summary: 'Is the database reachable?',
    responses: { 200: { description: 'Reachable', content: { 'application/json': { schema: DbHealth } } } },
  }), async (c) => {
    const started = Date.now()
    const result = await c.get('db').execute(sql`select now()::text as now`)
    const row = (result as unknown as { rows: { now: string }[] }).rows[0]
    return c.json({ ok: true, database: 'postgres', now: row.now, ms: Date.now() - started }, 200)
  })

  app.route('/api/books', bookRoutes)
  app.route('/api', metaRoutes)
  app.route('/api', meRoutes)
  app.route('/api/admin', adminRoutes)
  app.route('/api', readingRoutes)
  app.route('/auth', authRoutes)

  // Lesson 3.2: tell OpenAPI (and Swagger, APIM) how clients authenticate: our session cookie
  app.openAPIRegistry.registerComponent('securitySchemes', 'sessionCookie', {
    type: 'apiKey', in: 'cookie', name: cookieName({ APP_ORIGIN: 'https://' } as Bindings),
    description: 'Set by /auth/login → Asgardeo → /auth/callback',
  })

  // The contract + a docs page to try every endpoint in the browser
  app.doc31('/api/openapi.json', openApiInfo)
  app.get('/api/docs', swaggerUI({ url: '/api/openapi.json' }))

  // Any other /api path is a real 404 — never the React page by mistake
  app.all('/api/*', (c) => problem(c, 404, `No API endpoint ${c.req.method} ${c.req.path}`))

  // ---- Everything else: the React app from GitHub Pages ----
  app.get('*', async (c) => {
    const url = new URL(c.req.url)
    const origin = c.env.PAGES_ORIGIN.replace(/\/$/, '')
    const accept = c.req.header('Accept') ?? '*/*'
    let res = await fetch(origin + url.pathname + url.search, { headers: { Accept: accept } })
    // React routes (/books/42) are unknown to GitHub Pages → give it index.html
    if (res.status === 404 && accept.includes('text/html')) res = await fetch(origin + '/index.html')
    // Copy the headers: the fetched ones are read-only, and secureHeaders() still adds its own
    return new Response(res.body, { status: res.status, headers: new Headers(res.headers) })
  })

  // Unexpected errors → Problem Details; the real error goes to the logs only
  app.onError((err, c) => {
    if (err instanceof HTTPException) return problem(c, err.status as 400, err.message)
    console.error(c.req.method, c.req.path, err)
    return problem(c, 500, 'Something went wrong on the server')
  })

  return app
}
