/**
 * Lesson 1.2 — the database schema, written in TypeScript with Drizzle ORM.
 *
 * Each pgTable() below becomes a real PostgreSQL table. `npm run db:generate`
 * compares this file with the last migration and writes the SQL for the difference
 * into ./drizzle — those .sql files are committed to Git (= the schema history).
 *
 * Sheets → tables:  Books → books (+ book_categories, categories)
 *                   Users → users · Reading → reading_status · Ratings → ratings
 *                   Loans → loans · Sessions → (gone: replaced by login sessions in Phase 3)
 */
import { sql } from 'drizzle-orm'
import {
  pgTable, pgEnum, uuid, text, boolean, integer, smallint, numeric, date,
  timestamp, jsonb, serial, primaryKey, uniqueIndex, index, check,
} from 'drizzle-orm/pg-core'

// ---- Enums: a fixed list of allowed values, checked by Postgres itself ----
export const userRole = pgEnum('user_role', ['user', 'admin'])
export const userStatus = pgEnum('user_status', ['pending', 'active'])
export const readingState = pgEnum('reading_state', ['to_read', 'reading', 'read'])

// Timestamps "with time zone" store an exact moment (shown in Sri Lanka time by the app)
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

// ---- users ---------------------------------------------------------------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  sub: text('sub'),                          // Asgardeo user id (filled at first Asgardeo login, Phase 3)
  name: text('name'),
  picture: text('picture'),
  role: userRole('role').notNull().default('user'),
  status: userStatus('status').notNull().default('pending'),
  createdAt: createdAt(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('users_email_uq').on(sql`lower(${t.email})`),   // one account per email, any case
  uniqueIndex('users_sub_uq').on(t.sub),
])

// ---- categories (admins can add new ones without a code change) --------
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
})

// ---- books -----------------------------------------------------------------
export const books = pgTable('books', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  titleSinglish: text('title_singlish'),     // "Madol Doova" → search with an English keyboard
  author: text('author'),
  authorSinglish: text('author_singlish'),
  language: text('language'),
  isTranslation: boolean('is_translation').notNull().default(false),
  translator: text('translator'),
  originalTitle: text('original_title'),
  originalAuthor: text('original_author'),
  isbn: text('isbn'),
  publisher: text('publisher'),
  year: integer('year'),
  description: text('description'),
  reviewSummary: text('review_summary'),
  webSources: jsonb('web_sources').$type<{ title: string; url: string }[]>(),
  coverUrl: text('cover_url'),
  copies: integer('copies').notNull().default(1),
  // Lesson 4.5: how many copies are out right now. The CHECK below makes over-lending
  // IMPOSSIBLE, even when two admins click "Lend" at the same moment.
  onLoan: integer('on_loan').notNull().default(0),
  shelf: text('shelf'),
  // Private: only admins see these (the API removes them for normal users)
  purchasedFrom: text('purchased_from'),
  purchaseDate: date('purchase_date'),
  price: numeric('price', { precision: 10, scale: 2 }),
  notes: text('notes'),
  addedBy: uuid('added_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check('books_copies_positive', sql`${t.copies} >= 1`),
  check('books_on_loan_within_copies', sql`${t.onLoan} >= 0 and ${t.onLoan} <= ${t.copies}`),
  // The same ISBN twice = the same book → add a copy instead (the "duplicate" rule from v1)
  uniqueIndex('books_isbn_uq').on(t.isbn).where(sql`${t.isbn} is not null and ${t.isbn} <> ''`),
  // Full-text search over the words people type (Sinhala, Singlish and English)
  index('books_search_idx').using('gin', sql`to_tsvector('simple',
    coalesce(${t.title}, '') || ' ' || coalesce(${t.titleSinglish}, '') || ' ' ||
    coalesce(${t.author}, '') || ' ' || coalesce(${t.authorSinglish}, '') || ' ' ||
    coalesce(${t.translator}, '') || ' ' || coalesce(${t.originalTitle}, ''))`),
])

// ---- book_categories: many-to-many (a book has many categories and vice versa)
export const bookCategories = pgTable('book_categories', {
  bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.bookId, t.categoryId] })])

// ---- reading_status: one row per (user, book) ----------------------------
export const readingStatus = pgTable('reading_status', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  status: readingState('status').notNull().default('to_read'),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.bookId] })])

// ---- ratings: public, one per (user, book) ---------------------------------
export const ratings = pgTable('ratings', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  rating: smallint('rating').notNull(),
  review: text('review'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.bookId] }),
  check('ratings_1_to_5', sql`${t.rating} between 1 and 5`),
])

// ---- loans: returned_at IS NULL = the book is out right now ----------------
export const loans = pgTable('loans', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  borrowedAt: timestamp('borrowed_at', { withTimezone: true }).notNull().defaultNow(),
  returnedAt: timestamp('returned_at', { withTimezone: true }),
  lentBy: uuid('lent_by').references(() => users.id, { onDelete: 'set null' }),
  returnedBy: uuid('returned_by').references(() => users.id, { onDelete: 'set null' }),
}, (t) => [
  // Fast "what is out right now?" — only open loans are in this index
  index('loans_open_idx').on(t.bookId).where(sql`${t.returnedAt} is null`),
])

// ---- audit_log (Lesson 3.3): who changed what, and when --------------------
// Append-only: rows are only ever inserted. Useful for "who activated this user?"
export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),              // e.g. 'user.activate', 'user.role', 'user.delete'
  targetType: text('target_type').notNull(),     // 'user', later 'book', 'loan'…
  targetId: text('target_id'),
  details: jsonb('details').$type<Record<string, unknown>>(),
}, (t) => [index('audit_log_at_idx').on(t.at)])
