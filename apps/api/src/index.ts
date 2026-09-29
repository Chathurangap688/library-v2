/**
 * Lesson 0.2 — the Worker is the ONE entry point for the whole app.
 *
 *   /api/*  → our API (answered here, in the Worker)
 *   /*      → everything else is fetched from GitHub Pages (the built React app)
 *
 * Because the browser only ever talks to library.<you>.workers.dev, the page and
 * the API share one origin: no CORS, and (later) a SameSite=Strict session cookie.
 */
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

// Values from wrangler.jsonc "vars" (and later: secrets, KV, the database…)
type Bindings = {
  PAGES_ORIGIN: string   // e.g. https://chathurangap688.github.io/library-v2
}

const app = new Hono<{ Bindings: Bindings }>()

// Security headers on every answer (X-Content-Type-Options, X-Frame-Options, …)
app.use('*', secureHeaders())

// ---- API ------------------------------------------------------------------
// A "health check": monitoring tools (and you) call it to see the service is up.
app.get('/api/health', (c) =>
  c.json({ ok: true, service: 'library-api', time: new Date().toISOString() }),
)

// Any other /api path is a real 404 in JSON — never the React page by mistake.
app.all('/api/*', (c) => c.json({ ok: false, error: 'Not found' }, 404))

// ---- Everything else: proxy to GitHub Pages -----------------------------
app.get('*', async (c) => {
  const url = new URL(c.req.url)
  const origin = c.env.PAGES_ORIGIN.replace(/\/$/, '')
  const accept = c.req.header('Accept') ?? '*/*'

  let res = await fetch(origin + url.pathname + url.search, { headers: { Accept: accept } })

  // React handles its own routes (/books/42, /my-books…). GitHub Pages does not
  // know them and answers 404 → for page requests, send index.html instead.
  if (res.status === 404 && accept.includes('text/html')) {
    res = await fetch(origin + '/index.html')
  }

  // Copy the answer, then add our security headers on top
  return new Response(res.body, { status: res.status, headers: res.headers })
})

export default app
