/**
 * Lesson 2.2: the API CONTRACT — Zod schemas that do three jobs at once:
 *   1. check the input at runtime (400 if wrong),
 *   2. give TypeScript types to our code,
 *   3. generate the OpenAPI document (/api/openapi.json) that tools, APIM and React use.
 * `.openapi('Name')` gives a schema a name in the document (components/schemas/Name).
 */
import { z } from '@hono/zod-openapi'

// ---- errors (RFC 9457 Problem Details) ----
export const Problem = z.object({
  type: z.string().openapi({ example: 'about:blank' }),
  title: z.string().openapi({ example: 'Bad Request' }),
  status: z.number().int().openapi({ example: 400 }),
  detail: z.string().optional().openapi({ example: 'pageSize: Too big: expected number to be <=100' }),
  errors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
}).openapi('Problem')

export const problemResponse = (description: string) => ({
  description, content: { 'application/problem+json': { schema: Problem } },
})

// ---- health ----
export const Health = z.object({
  ok: z.boolean(), service: z.string(), time: z.string().openapi({ format: 'date-time' }),
}).openapi('Health')

export const DbHealth = z.object({
  ok: z.boolean(), database: z.string(), now: z.string(), ms: z.number().int(),
}).openapi('DbHealth')

// ---- books ----
const WebSource = z.object({ title: z.string(), url: z.string() })

export const Book = z.object({
  id: z.uuid(),
  title: z.string().openapi({ example: 'මඩොල් දූව' }),
  titleSinglish: z.string().nullable().openapi({ example: 'Madol Doova' }),
  author: z.string().nullable(),
  authorSinglish: z.string().nullable(),
  language: z.string().nullable().openapi({ example: 'Sinhala' }),
  isTranslation: z.boolean(),
  translator: z.string().nullable(),
  originalTitle: z.string().nullable(),
  originalAuthor: z.string().nullable(),
  isbn: z.string().nullable(),
  publisher: z.string().nullable(),
  year: z.number().int().nullable(),
  description: z.string().nullable(),
  reviewSummary: z.string().nullable(),
  webSources: z.array(WebSource).nullable(),
  coverUrl: z.string().nullable(),
  copies: z.number().int(),
  shelf: z.string().nullable(),
  createdAt: z.string().openapi({ format: 'date-time' }),
  updatedAt: z.string().openapi({ format: 'date-time' }),
  categories: z.array(z.string()).openapi({ example: ['Novel', 'Classic'] }),
  available: z.number().int().openapi({ description: 'copies minus open loans' }),
  avgRating: z.number().nullable().openapi({ example: 4.5 }),
  ratingCount: z.number().int(),
  // Lesson 4.1: the signed-in user's own status and rating
  myStatus: z.enum(['to_read', 'reading', 'read']).nullable(),
  myRating: z.number().int().min(1).max(5).nullable(),
  myReview: z.string().nullable(),
  // Lesson 3.3: only in answers to ADMINS (the server leaves them out for everyone else)
  purchasedFrom: z.string().nullable().optional().openapi({ description: 'admins only' }),
  purchaseDate: z.string().nullable().optional().openapi({ description: 'admins only', format: 'date' }),
  price: z.string().nullable().optional().openapi({ description: 'admins only (LKR)', example: '950.00' }),
  notes: z.string().nullable().optional().openapi({ description: 'admins only' }),
  addedByName: z.string().nullable().optional().openapi({ description: 'admins only' }),
}).openapi('Book')

export const PublicRating = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().nullable(),
  name: z.string().nullable().openapi({ description: "the reader's name (never the email)" }),
  updatedAt: z.string().openapi({ format: 'date-time' }),
}).openapi('PublicRating')

export const BookDetail = Book.extend({ ratings: z.array(PublicRating) }).openapi('BookDetail')

export const BookPage = z.object({
  items: z.array(Book),
  page: z.number().int(), pageSize: z.number().int(),
  total: z.number().int(), pages: z.number().int(),
}).openapi('BookPage')

const yesNo = z.enum(['true', 'false']).optional()

export const ListBooksQuery = z.object({
  q: z.string().trim().max(100).optional()
    .openapi({ description: 'Search title, author, translator… (Sinhala, English or Singlish)', example: 'madol' }),
  language: z.string().trim().max(40).optional().openapi({ example: 'Sinhala' }),
  category: z.union([z.string(), z.array(z.string())]).optional()
    .openapi({ description: 'Repeat for several: ?category=Novel&category=War (a book needs at least one)' }),
  translations: yesNo.openapi({ description: 'true = only translated books' }),
  available: yesNo.openapi({ description: 'true = only books with a free copy' }),
  // Lesson 4.1: "my shelves"
  shelf: z.enum(['to_read', 'reading', 'read', 'rated']).optional()
    .openapi({ description: 'Only books on MY shelf (or that I rated)' }),
  hideRead: yesNo.openapi({ description: 'true = leave out books I have read' }),
  sort: z.enum(['title', 'newest', 'rating']).default('title'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
})

export const BookIdParam = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' }, example: '3f5b2c1e-8d4a-4b6f-9a1e-2c7d8e9f0a1b' }),
})

// ---- meta ----
export const Category = z.object({ id: z.number().int(), name: z.string(), bookCount: z.number().int() }).openapi('Category')
export const Language = z.object({ language: z.string().nullable(), bookCount: z.number().int() }).openapi('Language')

// ---- account (Lesson 3.2) ----
export const Me = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string().nullable(),
  picture: z.string().nullable(),
  role: z.enum(['user', 'admin']),
  status: z.enum(['pending', 'active']),
}).openapi('Me')

// ---- admin (Lesson 3.3) ----
export const AdminUser = Me.extend({
  createdAt: z.string().openapi({ format: 'date-time' }),
  lastLoginAt: z.string().nullable().openapi({ format: 'date-time' }),
  linked: z.boolean().openapi({ description: 'has signed in with Asgardeo at least once' }),
  readCount: z.number().int(),
  openLoans: z.number().int(),
}).openapi('AdminUser')

export const UserIdParam = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
})

export const UpdateUser = z.object({
  status: z.enum(['pending', 'active']).optional(),
  role: z.enum(['user', 'admin']).optional(),
}).refine((v) => v.status !== undefined || v.role !== undefined, { message: 'Send status and/or role' })
  .openapi('UpdateUser')

// ---- my reading (Lesson 4.1) ----
export const ReadingState = z.enum(['to_read', 'reading', 'read']).openapi('ReadingState')
export const SetStatus = z.object({
  status: ReadingState.nullable().openapi({ description: 'null = take the book off my shelves' }),
}).openapi('SetStatus')
export const SetRating = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().trim().max(2000).nullable().optional(),
}).openapi('SetRating')
export const MyBookState = z.object({
  bookId: z.uuid(),
  myStatus: ReadingState.nullable(),
  myRating: z.number().int().nullable(),
  myReview: z.string().nullable(),
  avgRating: z.number().nullable(),
  ratingCount: z.number().int(),
}).openapi('MyBookState')
export const ShelfCounts = z.object({
  to_read: z.number().int(), reading: z.number().int(), read: z.number().int(), rated: z.number().int(),
}).openapi('ShelfCounts')

// ---- recommendations (Lesson 4.2) ----
export const Recommendation = z.object({
  book: Book,
  score: z.number().openapi({ description: '0–1, higher = better match' }),
  reason: z.string().openapi({ example: 'Because you liked other books by Martin Wickramasinghe' }),
}).openapi('Recommendation')

// ---- admin: books (Lesson 4.3) ----
const text = (max: number) => z.string().trim().max(max).nullable().optional()
export const BookInput = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300),
  titleSinglish: text(300), author: text(200), authorSinglish: text(200),
  language: text(40), isTranslation: z.boolean().optional(),
  translator: text(200), originalTitle: text(300), originalAuthor: text(200),
  isbn: z.string().trim().max(20).regex(/^[0-9Xx -]*$/, 'ISBN: digits (and X) only').nullable().optional(),
  publisher: text(200),
  year: z.number().int().min(0).max(2100).nullable().optional(),
  description: text(5000), reviewSummary: text(3000),
  webSources: z.array(z.object({ title: z.string().max(300), url: z.url() })).max(20).nullable().optional(),
  // a link (old Drive covers) or one of OUR stored covers: /covers/<uuid>.jpg (Lesson 4.4)
  coverUrl: z.union([z.url().max(1000), z.string().regex(/^\/covers\/[0-9a-f-]{36}\.(jpg|png|webp)$/, 'Not a cover link')])
    .nullable().optional().or(z.literal('')),
  copies: z.number().int().min(1).max(99).optional(),
  shelf: text(100),
  categories: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  // private (admin) fields
  purchasedFrom: text(200),
  purchaseDate: z.iso.date().nullable().optional().or(z.literal('')),
  price: z.string().trim().regex(/^\d{0,8}(\.\d{1,2})?$/, 'Price: a number like 950 or 950.00').nullable().optional().or(z.literal('')),
  notes: text(2000),
}).openapi('BookInput')

export const DuplicateQuery = z.object({
  title: z.string().trim().max(300).optional(),
  author: z.string().trim().max(200).optional(),
  isbn: z.string().trim().max(20).optional(),
  excludeId: z.uuid().optional(),
})
export const Duplicate = z.object({
  id: z.uuid(), title: z.string(), author: z.string().nullable(), copies: z.number().int(),
  match: z.enum(['isbn', 'title']),
}).openapi('Duplicate')
