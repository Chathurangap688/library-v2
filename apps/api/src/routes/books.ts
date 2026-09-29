/**
 * Lesson 2.1: the book resource.
 *
 *   GET /api/books        list  — search, filters, sorting, pagination
 *   GET /api/books/:id    one book + its public ratings
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import type { AppEnv } from '../types'
import { books, ratings, users } from '../db/schema'
import { validate } from '../lib/validate'
import { problem } from '../lib/problem'
import { bookExtras, publicBookColumns, searchLatin, searchText, singlishKey, singlishKeySql } from '../lib/books'

const yesNo = z.enum(['true', 'false']).optional().transform((v) => v === 'true')

// What the query string may contain. Anything else → 400 with a clear message.
export const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  language: z.string().trim().max(40).optional(),
  // ?category=Novel&category=War  → ['Novel', 'War'] (a book needs at least one of them)
  category: z.union([z.string(), z.array(z.string())]).optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])),
  translations: yesNo,   // only translated books
  available: yesNo,      // only books with a free copy
  sort: z.enum(['title', 'newest', 'rating']).default('title'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
})

const idParam = z.object({ id: z.uuid() })

export const bookRoutes = new Hono<AppEnv>()

bookRoutes.get('/', validate('query', listQuery), async (c) => {
  const f = c.req.valid('query')
  const db = c.get('db')

  // Build the WHERE part from the filters that were given
  const where: SQL[] = []
  if (f.q) {
    const key = singlishKey(f.q)
    where.push(key.length >= 2
      ? sql`(${searchText} ilike ${'%' + f.q + '%'} or ${singlishKeySql(searchLatin)} like ${'%' + key + '%'})`
      : sql`${searchText} ilike ${'%' + f.q + '%'}`)
  }
  if (f.language) where.push(eq(books.language, f.language))
  if (f.translations) where.push(eq(books.isTranslation, true))
  if (f.available) where.push(sql`${bookExtras.available} > 0`)
  if (f.category.length) {
    where.push(sql`exists (select 1 from book_categories bc join categories c on c.id = bc.category_id
      where bc.book_id = books.id and c.name in (${sql.join(f.category.map((n) => sql`${n}`), sql`, `)}))`)
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

  return c.json({ items, page: f.page, pageSize: f.pageSize, total, pages: Math.ceil(total / f.pageSize) })
})

bookRoutes.get('/:id', validate('param', idParam), async (c) => {
  const { id } = c.req.valid('param')
  const db = c.get('db')

  const [book] = await db.select({ ...publicBookColumns, ...bookExtras }).from(books).where(eq(books.id, id))
  if (!book) return problem(c, 404, `No book with id ${id}`)

  // Ratings are public: show the reader's name, never their email
  const bookRatings = await db
    .select({ rating: ratings.rating, review: ratings.review, name: users.name, updatedAt: ratings.updatedAt })
    .from(ratings).innerJoin(users, eq(users.id, ratings.userId))
    .where(eq(ratings.bookId, id)).orderBy(desc(ratings.updatedAt))

  return c.json({ ...book, ratings: bookRatings })
})
