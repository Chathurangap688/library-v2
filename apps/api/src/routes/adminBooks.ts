/**
 * Lesson 4.3: admins add, edit and remove books (the router sits behind requireAdmin).
 *
 *   GET    /api/admin/books/duplicates?title=&author=&isbn=   possible duplicates (warn before saving)
 *   POST   /api/admin/books                 create            → 201 + the book
 *   PATCH  /api/admin/books/{id}            change some fields → the book
 *   POST   /api/admin/books/{id}/copies     one more copy of the same book
 *   DELETE /api/admin/books/{id}            remove (not while a copy is on loan)
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { and, eq, ne, sql, type SQL } from 'drizzle-orm'
import type { AppEnv } from '../types'
import type { Db } from '../db/client'
import { books } from '../db/schema'
import { problem } from '../lib/problem'
import { validationHook } from '../lib/validate'
import { audit } from '../lib/audit'
import { bookColumnsFor } from '../lib/books'
import { hasSinhala, sinhalaToLatin } from '../lib/singlish'
import { Book, BookIdParam, BookInput, Duplicate, DuplicateQuery, problemResponse } from '../lib/schemas'

export const adminBookRoutes = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })

const secured = { security: [{ sessionCookie: [] }], tags: ['Admin: books'] }
const adminErrors = { 400: problemResponse('Invalid input'), 401: problemResponse('Not signed in'), 403: problemResponse('Not an admin') }
const bookResponse = (d: string) => ({ description: d, content: { 'application/json': { schema: Book } } })
type Input = z.infer<typeof BookInput>

const normIsbn = (isbn?: string | null) => (isbn ? isbn.replace(/[^0-9Xx]/g, '').toUpperCase() || null : isbn)

/** Turn the form input into table values: '' → null, ISBN cleaned, Singlish filled in if missing */
function toRow(input: Partial<Input>) {
  const row: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (k === 'categories') continue
    row[k] = v === '' ? null : v
  }
  if ('isbn' in input) row.isbn = normIsbn(input.isbn)
  // Lesson 7c again: an English-keyboard search should find Sinhala titles
  if (input.title && hasSinhala(input.title) && !input.titleSinglish) row.titleSinglish = sinhalaToLatin(input.title)
  if (input.author && hasSinhala(input.author) && !input.authorSinglish) row.authorSinglish = sinhalaToLatin(input.author)
  return row
}

/**
 * Replace a book's categories in ONE SQL statement (so it is all-or-nothing):
 * create the missing category names, link the wanted ones, unlink the rest.
 * The names go in as ONE JSON parameter (Drizzle would turn a JS array into ($1, $2, $3)).
 */
async function setCategories(db: Db, bookId: string, names: string[]) {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  await db.execute(sql`
    with wanted as (select jsonb_array_elements_text(${JSON.stringify(unique)}::jsonb) as name),
    created as (insert into categories (name) select name from wanted on conflict (name) do nothing returning id),
    ids as (select id from created union select c.id from categories c join wanted w on w.name = c.name),
    removed as (delete from book_categories where book_id = ${bookId} and category_id not in (select id from ids))
    insert into book_categories (book_id, category_id) select ${bookId}, id from ids on conflict do nothing`)
}

async function findDuplicates(db: Db, q: { title?: string; author?: string; isbn?: string; excludeId?: string }) {
  const isbn = normIsbn(q.isbn)
  const tests: SQL[] = []
  if (isbn) tests.push(sql`${books.isbn} = ${isbn}`)
  if (q.title) tests.push(sql`(lower(trim(${books.title})) = lower(trim(${q.title}))
      and (${q.author ?? ''} = '' or ${books.author} is null or lower(trim(${books.author})) = lower(trim(${q.author ?? ''}))))`)
  if (!tests.length) return []
  const rows = await db.select({ id: books.id, title: books.title, author: books.author, copies: books.copies, isbn: books.isbn })
    .from(books).where(and(sql`(${sql.join(tests, sql` or `)})`, q.excludeId ? ne(books.id, q.excludeId) : undefined)).limit(5)
  return rows.map(({ isbn: rowIsbn, ...r }) => ({ ...r, match: (isbn && rowIsbn === isbn ? 'isbn' : 'title') as 'isbn' | 'title' }))
}

const readBook = async (db: Db, id: string, userId: string) =>
  (await db.select(bookColumnsFor(true, userId)).from(books).where(eq(books.id, id)))[0]

/** Postgres error 23505 = unique violation (here: the ISBN index) */
const isDuplicateIsbn = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } }
  return e.code === '23505' || e.cause?.code === '23505'
}

adminBookRoutes.openapi(createRoute({
  ...secured, method: 'get', path: '/duplicates', operationId: 'adminFindDuplicates', summary: 'Books that look like the one being entered',
  request: { query: DuplicateQuery },
  responses: { 200: { description: 'Possible duplicates', content: { 'application/json': { schema: z.array(Duplicate) } } }, ...adminErrors },
}), async (c) => c.json(await findDuplicates(c.get('db'), c.req.valid('query')), 200))

adminBookRoutes.openapi(createRoute({
  ...secured, method: 'post', path: '/', operationId: 'adminCreateBook', summary: 'Add a book',
  request: { body: { content: { 'application/json': { schema: BookInput } }, required: true } },
  responses: { 201: bookResponse('Created'), ...adminErrors, 409: problemResponse('Same ISBN already in the library') },
}), async (c) => {
  const input = c.req.valid('json'); const db = c.get('db'); const me = c.get('user')!
  let id: string
  try {
    const [row] = await db.insert(books).values({ ...(toRow(input) as typeof books.$inferInsert), addedBy: me.id }).returning({ id: books.id })
    id = row.id
  } catch (err) {
    if (isDuplicateIsbn(err)) return problem(c, 409, 'A book with this ISBN is already in the library — add a copy instead', { code: 'DUPLICATE_ISBN', duplicates: await findDuplicates(db, { isbn: input.isbn ?? '' }) })
    throw err
  }
  if (input.categories) {
    try {
      await setCategories(db, id, input.categories)
    } catch (err) {
      // Compensating action: the Neon HTTP driver cannot keep a transaction open across
      // two statements, so if step 2 fails we undo step 1 — no half-saved book is left behind.
      await db.delete(books).where(eq(books.id, id))
      throw err
    }
  }
  await audit(db, me.id, 'book.create', 'book', id, { title: input.title })
  return c.json(await readBook(db, id, me.id), 201)
})

adminBookRoutes.openapi(createRoute({
  ...secured, method: 'patch', path: '/{id}', operationId: 'adminUpdateBook', summary: 'Change some fields of a book',
  request: { params: BookIdParam, body: { content: { 'application/json': { schema: BookInput.partial() } }, required: true } },
  responses: { 200: bookResponse('Updated'), ...adminErrors, 404: problemResponse('No such book'), 409: problemResponse('ISBN used by another book, or fewer copies than are on loan') },
}), async (c) => {
  const { id } = c.req.valid('param'); const input = c.req.valid('json'); const db = c.get('db'); const me = c.get('user')!
  const [before] = await db.select({ copies: books.copies, onLoan: sql<number>`(select count(*) from loans l where l.book_id = books.id and l.returned_at is null)::int` })
    .from(books).where(eq(books.id, id))
  if (!before) return problem(c, 404, `No book with id ${id}`)
  if (input.copies !== undefined && input.copies < before.onLoan) return problem(c, 409, `${before.onLoan} copies are on loan — copies cannot be less than that`)

  const row = toRow(input)
  if (Object.keys(row).length) {
    try {
      await db.update(books).set({ ...row, updatedAt: new Date() }).where(eq(books.id, id))
    } catch (err) {
      if (isDuplicateIsbn(err)) return problem(c, 409, 'Another book already has this ISBN', { code: 'DUPLICATE_ISBN' })
      throw err
    }
  }
  if (input.categories) await setCategories(db, id, input.categories)
  await audit(db, me.id, 'book.update', 'book', id, { fields: Object.keys(input) })
  return c.json(await readBook(db, id, me.id), 200)
})

adminBookRoutes.openapi(createRoute({
  ...secured, method: 'post', path: '/{id}/copies', operationId: 'adminAddCopy', summary: 'We have one more copy of this book',
  request: { params: BookIdParam },
  responses: { 200: bookResponse('Updated'), ...adminErrors, 404: problemResponse('No such book') },
}), async (c) => {
  const { id } = c.req.valid('param'); const db = c.get('db'); const me = c.get('user')!
  // copies = copies + 1 in the database (safe even if two admins click at the same moment)
  const [row] = await db.update(books).set({ copies: sql`${books.copies} + 1`, updatedAt: new Date() }).where(eq(books.id, id)).returning({ copies: books.copies })
  if (!row) return problem(c, 404, `No book with id ${id}`)
  await audit(db, me.id, 'book.copy', 'book', id, { copies: row.copies })
  return c.json(await readBook(db, id, me.id), 200)
})

adminBookRoutes.openapi(createRoute({
  ...secured, method: 'delete', path: '/{id}', operationId: 'adminDeleteBook', summary: 'Remove a book (its ratings and shelf entries go too)',
  request: { params: BookIdParam },
  responses: { 204: { description: 'Removed' }, ...adminErrors, 404: problemResponse('No such book'), 409: problemResponse('A copy is on loan') },
}), async (c) => {
  const { id } = c.req.valid('param'); const db = c.get('db'); const me = c.get('user')!
  const [book] = await db.select({ title: books.title, onLoan: sql<number>`(select count(*) from loans l where l.book_id = books.id and l.returned_at is null)::int` })
    .from(books).where(eq(books.id, id))
  if (!book) return problem(c, 404, `No book with id ${id}`)
  if (book.onLoan > 0) return problem(c, 409, `"${book.title}" is on loan — mark it returned first`)
  await db.delete(books).where(eq(books.id, id))
  await audit(db, me.id, 'book.delete', 'book', id, { title: book.title })
  return c.body(null, 204)
})
