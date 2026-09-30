/**
 * Lesson 2.1 + 2.2: small lists the UI needs for its filter menus.
 *   GET /api/categories   [{ id, name, bookCount }]
 *   GET /api/languages    [{ language, bookCount }]
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { asc, count, eq, isNotNull } from 'drizzle-orm'
import type { AppEnv } from '../types'
import { bookCategories, books, categories } from '../db/schema'
import { validationHook } from '../lib/validate'
import { Category, Language } from '../lib/schemas'

export const metaRoutes = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })

metaRoutes.openapi(createRoute({
  method: 'get', path: '/categories', tags: ['Meta'], operationId: 'listCategories',
  summary: 'All categories with how many books each has',
  responses: { 200: { description: 'Categories A–Z', content: { 'application/json': { schema: z.array(Category) } } } },
}), async (c) => {
  const rows = await c.get('db')
    .select({ id: categories.id, name: categories.name, bookCount: count(bookCategories.bookId) })
    .from(categories).leftJoin(bookCategories, eq(bookCategories.categoryId, categories.id))
    .groupBy(categories.id).orderBy(asc(categories.name))
  return c.json(rows, 200)
})

metaRoutes.openapi(createRoute({
  method: 'get', path: '/languages', tags: ['Meta'], operationId: 'listLanguages',
  summary: 'Book languages with counts',
  responses: { 200: { description: 'Languages A–Z', content: { 'application/json': { schema: z.array(Language) } } } },
}), async (c) => {
  const rows = await c.get('db')
    .select({ language: books.language, bookCount: count() })
    .from(books).where(isNotNull(books.language)).groupBy(books.language).orderBy(asc(books.language))
  return c.json(rows, 200)
})
