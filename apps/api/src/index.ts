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
import { eq, getTableColumns, sql } from 'drizzle-orm'
import { getDb } from './db/client'
import { books, bookCategories, categories } from './db/schema'

// Values from wrangler.jsonc "vars" (and later: secrets, KV, the database…)
type Bindings = {
  PAGES_ORIGIN: string   // e.g. https://chathurangap688.github.io/library-v2
  DATABASE_URL: string   // Lesson 1.1: a SECRET (.dev.vars locally, `wrangler secret put` in Cloudflare)
}

const app = new Hono<{ Bindings: Bindings }>()

// Security headers on every answer (X-Content-Type-Options, X-Frame-Options, …)
app.use('*', secureHeaders())

// ---- API ------------------------------------------------------------------
// A "health check": monitoring tools (and you) call it to see the service is up.
app.get('/api/health', (c) =>
  c.json({ ok: true, service: 'library-api', time: new Date().toISOString() }),
)

// Lesson 1.2: is the database reachable? (Neon may take ~1 s to wake up after 5 idle minutes)
app.get('/api/health/db', async (c) => {
  const started = Date.now()
  const db = getDb(c.env.DATABASE_URL)
  const [row] = await db.execute<{ now: string }>(sql`select now() as now`).then((r) => r.rows)
  return c.json({ ok: true, database: 'neon', now: row.now, ms: Date.now() - started })
})

// Lesson 1.2: the book list, straight from Postgres.
// Private purchase fields are left out for now — in Phase 3 admins get them back.
app.get('/api/books', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const { purchasedFrom, purchaseDate, price, notes, addedBy, ...publicColumns } = getTableColumns(books)
  void purchasedFrom; void purchaseDate; void price; void notes; void addedBy   // (deliberately unused)

  const rows = await db
    .select({
      ...publicColumns,
      // all category names of the book as one array: ['Novel', 'Sinhala']
      categories: sql<string[]>`coalesce(array_agg(${categories.name} order by ${categories.name})
                                 filter (where ${categories.name} is not null), '{}')`,
      // copies minus the loans that are still open
      available: sql<number>`(${books.copies} - (select count(*) from loans l
                              where l.book_id = ${books.id} and l.returned_at is null))::int`,
    })
    .from(books)
    .leftJoin(bookCategories, eq(bookCategories.bookId, books.id))
    .leftJoin(categories, eq(categories.id, bookCategories.categoryId))
    .groupBy(books.id)
    .orderBy(books.title)

  return c.json({ ok: true, count: rows.length, books: rows })
})

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

// Lesson 1.2: one place for unexpected errors → a clean JSON answer (details go to the logs only)
app.onError((err, c) => {
  console.error(c.req.method, c.req.path, err)
  return c.json({ ok: false, error: 'Something went wrong on the server' }, 500)
})

export default app
