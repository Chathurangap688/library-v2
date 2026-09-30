/**
 * Lesson 4.4: serve cover images from R2 — GET /covers/<uuid>.jpg
 * Only for signed-in, active users (the library is private). The names are random UUIDs,
 * and a cover never changes once stored → the browser may cache it for a year.
 */
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { problem } from '../lib/problem'

export const coverRoutes = new Hono<AppEnv>()

coverRoutes.get('/:file{[0-9a-f-]{36}\\.(jpg|png|webp)}', async (c) => {
  const object = await c.env.COVERS.get(`covers/${c.req.param('file')}`)
  if (!object) return problem(c, 404, 'No such cover')
  // If the browser already has this version (same ETag), answer "304 Not Modified" with no body
  if (c.req.header('if-none-match') === object.httpEtag) return c.body(null, 304)
  const headers = new Headers()
  object.writeHttpMetadata(headers)          // Content-Type + Cache-Control saved at upload
  headers.set('etag', object.httpEtag)
  return new Response(object.body, { headers })
})

// Anything else under /covers (e.g. "../secret") is a 404 here — never passed on to GitHub Pages
coverRoutes.all('*', (c) => problem(c, 404, 'No such cover'))
