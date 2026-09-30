/**
 * Lesson 2.1 + 2.2: the book resource, described with createRoute().
 * Each route = method + path + input schemas + possible answers. From this ONE
 * description Hono checks the input AND writes the OpenAPI document.
 *
 *   GET /api/books        list  — search, filters, sorting, pagination
 *   GET /api/books/:id    one book + its public ratings
 */
import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import type { AppEnv } from '../types'
import { books, ratings, users } from '../db/schema'
import { problem } from '../lib/problem'
import { daysOut, loanDays } from '../lib/loans'
import { validationHook } from '../lib/validate'
import { bookColumnsFor, bookExtras, searchLatin, searchText, singlishKey, singlishKeySql } from '../lib/books'
import { BookDetail, BookIdParam, BookPage, ListBooksQuery, problemResponse } from '../lib/schemas'

export const bookRoutes = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })

const listBooks = createRoute({
  method: 'get', path: '/', security: [{ sessionCookie: [] }], tags: ['Books'], operationId: 'listBooks',
  summary: 'List books (search, filter, sort, page)',
  request: { query: ListBooksQuery },
  responses: {
    200: { description: 'One page of books', content: { 'application/json': { schema: BookPage } } },
    400: problemResponse('The query string is not valid'),
    401: problemResponse('Not signed in'),
    403: problemResponse('Account not active yet'),
  },
})

bookRoutes.openapi(listBooks, async (c) => {
  const f = c.req.valid('query')
  const db = c.get('db')
  const me = c.get('user')!                                        // requireActive guarantees a user
  const columns = bookColumnsFor(me.role === 'admin', me.id)       // admins see private fields (3.3), everyone their own status (4.1)
  const categoryNames = f.category === undefined ? [] : Array.isArray(f.category) ? f.category : [f.category]

  // Build the WHERE part from the filters that were given
  const where: SQL[] = []
  if (f.q) {
    const key = singlishKey(f.q)
    where.push(key.length >= 2
      ? sql`(${searchText} ilike ${'%' + f.q + '%'} or ${singlishKeySql(searchLatin)} like ${'%' + key + '%'})`
      : sql`${searchText} ilike ${'%' + f.q + '%'}`)
  }
  if (f.language) where.push(eq(books.language, f.language))
  if (f.translations === 'true') where.push(eq(books.isTranslation, true))
  if (f.available === 'true') where.push(sql`${bookExtras.available} > 0`)
  if (categoryNames.length) {
    where.push(sql`exists (select 1 from book_categories bc join categories c on c.id = bc.category_id
      where bc.book_id = books.id and c.name in (${sql.join(categoryNames.map((n) => sql`${n}`), sql`, `)}))`)
  }
  // Lesson 4.1: my shelves
  if (f.shelf === 'borrowed') where.push(sql`exists (select 1 from loans l where l.book_id = books.id and l.user_id = ${me.id} and l.returned_at is null)`)
  else if (f.shelf === 'rated') where.push(sql`exists (select 1 from ratings r where r.book_id = books.id and r.user_id = ${me.id})`)
  else if (f.shelf) where.push(sql`exists (select 1 from reading_status rs where rs.book_id = books.id and rs.user_id = ${me.id} and rs.status = ${f.shelf})`)
  if (f.hideRead === 'true') where.push(sql`not exists (select 1 from reading_status rs where rs.book_id = books.id and rs.user_id = ${me.id} and rs.status = 'read')`)
  const condition = where.length ? and(...where) : undefined

  const order = f.sort === 'newest' ? [desc(books.createdAt)]
    : f.sort === 'rating' ? [sql`${bookExtras.avgRating} desc nulls last`, asc(books.title)]
    : [asc(books.title)]

  // Two queries in parallel: this page of books + the total count (for "page 2 of 5")
  const [items, [{ total }]] = await Promise.all([
    db.select(columns).from(books).where(condition)
      .orderBy(...order).limit(f.pageSize).offset((f.page - 1) * f.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(books).where(condition),
  ])

  return c.json({ items, page: f.page, pageSize: f.pageSize, total, pages: Math.ceil(total / f.pageSize) }, 200)
})

const getBook = createRoute({
  method: 'get', path: '/{id}', security: [{ sessionCookie: [] }], tags: ['Books'], operationId: 'getBook',
  summary: 'One book with its public ratings',
  request: { params: BookIdParam },
  responses: {
    200: { description: 'The book', content: { 'application/json': { schema: BookDetail } } },
    400: problemResponse('The id is not a valid UUID'),
    401: problemResponse('Not signed in'),
    403: problemResponse('Account not active yet'),
    404: problemResponse('No book with this id'),
  },
})

bookRoutes.openapi(getBook, async (c) => {
  const { id } = c.req.valid('param')
  const db = c.get('db')

  const me = c.get('user')!
  const [book] = await db.select(bookColumnsFor(me.role === 'admin', me.id)).from(books).where(eq(books.id, id))
  if (!book) return problem(c, 404, `No book with id ${id}`)

  // Ratings are public: show the reader's name, never their email
  const bookRatings = await db
    .select({ rating: ratings.rating, review: ratings.review, name: users.name, updatedAt: ratings.updatedAt })
    .from(ratings).innerJoin(users, eq(users.id, ratings.userId))
    .where(eq(ratings.bookId, id)).orderBy(desc(ratings.updatedAt))

  // Lesson 4.5: admins also see who has the copies now
  const openLoans = me.role !== 'admin' ? undefined : (await db.execute(sql`
    select l.id, l.user_id as "userId", u.name, u.email, l.borrowed_at as "borrowedAt",
      ${daysOut} as days, ${daysOut} > ${loanDays(c.env)} as overdue
    from loans l join users u on u.id = l.user_id
    where l.book_id = ${id} and l.returned_at is null order by l.borrowed_at`) as unknown as { rows: { borrowedAt: string | Date }[] }).rows
    .map((r) => ({ ...r, borrowedAt: new Date(r.borrowedAt).toISOString() }))

  return c.json({ ...book, ratings: bookRatings, ...(openLoans ? { openLoans } : {}) } as never, 200)
})
