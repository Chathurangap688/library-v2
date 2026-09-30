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
import { validationHook } from '../lib/validate'
import { bookExtras, publicBookColumns, searchLatin, searchText, singlishKey, singlishKeySql } from '../lib/books'
import { BookDetail, BookIdParam, BookPage, ListBooksQuery, problemResponse } from '../lib/schemas'

export const bookRoutes = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })

const listBooks = createRoute({
  method: 'get', path: '/', tags: ['Books'], operationId: 'listBooks',
  summary: 'List books (search, filter, sort, page)',
  request: { query: ListBooksQuery },
  responses: {
    200: { description: 'One page of books', content: { 'application/json': { schema: BookPage } } },
    400: problemResponse('The query string is not valid'),
  },
})

bookRoutes.openapi(listBooks, async (c) => {
  const f = c.req.valid('query')
  const db = c.get('db')
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
  const condition = where.length ? and(...where) : undefined

  const order = f.sort === 'newest' ? [desc(books.createdAt)]
    : f.sort === 'rating' ? [sql`${bookExtras.avgRating} desc nulls last`, asc(books.title)]
    : [asc(books.title)]

  // Two queries in parallel: this page of books + the total count (for "page 2 of 5")
  const [items, [{ total }]] = await Promise.all([
    db.select({ ...publicBookColumns, ...bookExtras }).from(books).where(condition)
      .orderBy(...order).limit(f.pageSize).offset((f.page - 1) * f.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(books).where(condition),
  ])

  return c.json({ items, page: f.page, pageSize: f.pageSize, total, pages: Math.ceil(total / f.pageSize) }, 200)
})

const getBook = createRoute({
  method: 'get', path: '/{id}', tags: ['Books'], operationId: 'getBook',
  summary: 'One book with its public ratings',
  request: { params: BookIdParam },
  responses: {
    200: { description: 'The book', content: { 'application/json': { schema: BookDetail } } },
    400: problemResponse('The id is not a valid UUID'),
    404: problemResponse('No book with this id'),
  },
})

bookRoutes.openapi(getBook, async (c) => {
  const { id } = c.req.valid('param')
  const db = c.get('db')

  const [book] = await db.select({ ...publicBookColumns, ...bookExtras }).from(books).where(eq(books.id, id))
  if (!book) return problem(c, 404, `No book with id ${id}`)

  // Ratings are public: show the reader's name, never their email
  const bookRatings = await db
    .select({ rating: ratings.rating, review: ratings.review, name: users.name, updatedAt: ratings.updatedAt })
    .from(ratings).innerJoin(users, eq(users.id, ratings.userId))
    .where(eq(ratings.bookId, id)).orderBy(desc(ratings.updatedAt))

  return c.json({ ...book, ratings: bookRatings }, 200)
})
