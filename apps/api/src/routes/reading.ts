/**
 * Lesson 4.1: MY reading — status and rating of the signed-in user.
 *
 *   PUT    /api/books/{id}/status   { status: 'to_read' | 'reading' | 'read' | null }
 *   PUT    /api/books/{id}/rating   { rating: 1–5, review? }   (ratings are public)
 *   DELETE /api/books/{id}/rating
 *   GET    /api/me/shelves          how many books on each of my shelves
 *
 * PUT = "make it so": sending the same request twice gives the same result (idempotent).
 * Every answer returns the book's new state, so the UI can update without reloading.
 */
import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { and, eq, sql } from 'drizzle-orm'
import type { AppEnv } from '../types'
import { books, ratings, readingStatus } from '../db/schema'
import { problem } from '../lib/problem'
import { validationHook } from '../lib/validate'
import { bookExtras, myBookColumns } from '../lib/books'
import { BookIdParam, MyBookState, SetRating, SetStatus, ShelfCounts, problemResponse } from '../lib/schemas'
import type { Db } from '../db/client'

export const readingRoutes = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })

const secured = { security: [{ sessionCookie: [] }], tags: ['My reading'] }
const errors = { 400: problemResponse('Invalid input'), 401: problemResponse('Not signed in'), 403: problemResponse('Account not active'), 404: problemResponse('No such book') }
const stateResponse = { description: 'The book as I see it now', content: { 'application/json': { schema: MyBookState } } }

async function bookExists(db: Db, id: string) {
  const [row] = await db.select({ id: books.id }).from(books).where(eq(books.id, id))
  return !!row
}
async function stateOf(db: Db, bookId: string, userId: string) {
  const mine = myBookColumns(userId)
  const [row] = await db.select({ bookId: books.id, myStatus: mine.myStatus, myRating: mine.myRating, myReview: mine.myReview,
    avgRating: bookExtras.avgRating, ratingCount: bookExtras.ratingCount }).from(books).where(eq(books.id, bookId))
  return row
}

readingRoutes.openapi(createRoute({
  ...secured, method: 'put', path: '/books/{id}/status', operationId: 'setMyStatus', summary: 'Put a book on one of my shelves (or take it off)',
  request: { params: BookIdParam, body: { content: { 'application/json': { schema: SetStatus } }, required: true } },
  responses: { 200: stateResponse, ...errors },
}), async (c) => {
  const { id } = c.req.valid('param'); const { status } = c.req.valid('json')
  const db = c.get('db'); const me = c.get('user')!
  if (!(await bookExists(db, id))) return problem(c, 404, `No book with id ${id}`)
  if (status === null) {
    await db.delete(readingStatus).where(and(eq(readingStatus.userId, me.id), eq(readingStatus.bookId, id)))
  } else {
    // "upsert": insert, or update the row that is already there (one row per user + book)
    await db.insert(readingStatus).values({ userId: me.id, bookId: id, status })
      .onConflictDoUpdate({ target: [readingStatus.userId, readingStatus.bookId], set: { status, updatedAt: new Date() } })
  }
  return c.json(await stateOf(db, id, me.id), 200)
})

readingRoutes.openapi(createRoute({
  ...secured, method: 'put', path: '/books/{id}/rating', operationId: 'setMyRating', summary: 'Rate a book 1–5 (public), with an optional review',
  request: { params: BookIdParam, body: { content: { 'application/json': { schema: SetRating } }, required: true } },
  responses: { 200: stateResponse, ...errors },
}), async (c) => {
  const { id } = c.req.valid('param'); const { rating, review } = c.req.valid('json')
  const db = c.get('db'); const me = c.get('user')!
  if (!(await bookExists(db, id))) return problem(c, 404, `No book with id ${id}`)
  const text = review ? review : null
  await db.insert(ratings).values({ userId: me.id, bookId: id, rating, review: text })
    .onConflictDoUpdate({ target: [ratings.userId, ratings.bookId], set: { rating, review: text, updatedAt: new Date() } })
  // Rating a book means you read it: put it on the "Read" shelf too (like v1)
  await db.insert(readingStatus).values({ userId: me.id, bookId: id, status: 'read' })
    .onConflictDoUpdate({ target: [readingStatus.userId, readingStatus.bookId], set: { status: 'read', updatedAt: new Date() } })
  return c.json(await stateOf(db, id, me.id), 200)
})

readingRoutes.openapi(createRoute({
  ...secured, method: 'delete', path: '/books/{id}/rating', operationId: 'deleteMyRating', summary: 'Remove my rating',
  request: { params: BookIdParam },
  responses: { 200: stateResponse, ...errors },
}), async (c) => {
  const { id } = c.req.valid('param'); const db = c.get('db'); const me = c.get('user')!
  if (!(await bookExists(db, id))) return problem(c, 404, `No book with id ${id}`)
  await db.delete(ratings).where(and(eq(ratings.userId, me.id), eq(ratings.bookId, id)))
  return c.json(await stateOf(db, id, me.id), 200)
})

readingRoutes.openapi(createRoute({
  ...secured, method: 'get', path: '/me/shelves', operationId: 'myShelves', summary: 'How many books are on each of my shelves',
  responses: { 200: { description: 'Counts', content: { 'application/json': { schema: ShelfCounts } } }, 401: problemResponse('Not signed in') },
}), async (c) => {
  const db = c.get('db'); const me = c.get('user')!
  const [row] = await db.select({
    to_read: sql<number>`count(*) filter (where ${readingStatus.status} = 'to_read')::int`,
    reading: sql<number>`count(*) filter (where ${readingStatus.status} = 'reading')::int`,
    read: sql<number>`count(*) filter (where ${readingStatus.status} = 'read')::int`,
    rated: sql<number>`(select count(*) from ratings r where r.user_id = ${me.id})::int`,
  }).from(readingStatus).where(eq(readingStatus.userId, me.id))
  return c.json(row, 200)
})
