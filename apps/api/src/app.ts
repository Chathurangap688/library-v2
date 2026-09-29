/**
 * Lesson 2.1: the whole Worker app, built by a function.
 * `makeDb` is passed in (dependency injection) so tests can use a different database
 * driver than production — the routes do not care where `c.get('db')` comes from.
 *
 *   /api/*  → our API          /*  → the React app from GitHub Pages
 */
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { HTTPException } from 'hono/http-exception'
import { sql } from 'drizzle-orm'
import type { AppEnv, Bindings } from './types'
import type { Db } from './db/client'
import { problem } from './lib/problem'
import { bookRoutes } from './routes/books'
import { metaRoutes } from './routes/meta'

export function buildApp(makeDb: (env: Bindings) => Db) {
  const app = new Hono<AppEnv>()

  app.use('*', secureHeaders())

  // Give every API request its own database handle: c.get('db')
  app.use('/api/*', async (c, next) => {
    c.set('db', makeDb(c.env))
    await next()
  })

  // ---- API ----
  app.get('/api/health', (c) =>
    c.json({ ok: true, service: 'library-api', time: new Date().toISOString() }))

  app.get('/api/health/db', async (c) => {
    const started = Date.now()
    const result = await c.get('db').execute(sql`select now() as now`)
    const row = (result as unknown as { rows: { now: string }[] }).rows[0]
    return c.json({ ok: true, database: 'postgres', now: row.now, ms: Date.now() - started })
  })

  app.route('/api/books', bookRoutes)
  app.route('/api', metaRoutes)

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
    return new Response(res.body, { status: res.status, headers: res.headers })
  })

  // Unexpected errors → Problem Details; the real error goes to the logs only
  app.onError((err, c) => {
    if (err instanceof HTTPException) return problem(c, err.status as 400, err.message)
    console.error(c.req.method, c.req.path, err)
    return problem(c, 500, 'Something went wrong on the server')
  })

  return app
}
