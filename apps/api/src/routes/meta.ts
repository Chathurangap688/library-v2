/**
 * Lesson 2.1: small lists the UI needs for its filter menus.
 *   GET /api/categories   [{ id, name, bookCount }]
 *   GET /api/languages    [{ language, bookCount }]
 */
import { Hono } from 'hono'
import { asc, count, eq, isNotNull } from 'drizzle-orm'
import type { AppEnv } from '../types'
import { bookCategories, books, categories } from '../db/schema'

export const metaRoutes = new Hono<AppEnv>()

metaRoutes.get('/categories', async (c) => {
  const rows = await c.get('db')
    .select({ id: categories.id, name: categories.name, bookCount: count(bookCategories.bookId) })
    .from(categories).leftJoin(bookCategories, eq(bookCategories.categoryId, categories.id))
    .groupBy(categories.id).orderBy(asc(categories.name))
  return c.json(rows)
})

metaRoutes.get('/languages', async (c) => {
  const rows = await c.get('db')
    .select({ language: books.language, bookCount: count() })
    .from(books).where(isNotNull(books.language)).groupBy(books.language).orderBy(asc(books.language))
  return c.json(rows)
})
