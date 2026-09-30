/**
 * Lesson 4.5: lending.
 *   Admins:  POST /api/admin/loans {bookId, userId}   lend a copy
 *            POST /api/admin/loans/{id}/return        mark returned
 *            GET  /api/admin/loans?status=open|overdue|returned
 *            GET  /api/admin/loans/summary            counts for the header badge
 *   Readers: GET  /api/me/loans                        what I have now (+ my history)
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { AppEnv } from '../types'
import { books, loans, users } from '../db/schema'
import { problem } from '../lib/problem'
import { validationHook } from '../lib/validate'
import { audit } from '../lib/audit'
import { daysOut, loanDays } from '../lib/loans'
import { LendBody, LoanIdParam, LoanRow, LoanSummary, problemResponse } from '../lib/schemas'
import type { Db } from '../db/client'

export const adminLoanRoutes = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })
export const myLoanRoutes = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })

const secured = (tag: string) => ({ security: [{ sessionCookie: [] }], tags: [tag] })
const errors = { 400: problemResponse('Invalid input'), 401: problemResponse('Not signed in'), 403: problemResponse('Not allowed') }

/** Postgres error 23514 = a CHECK constraint said no (here: on_loan would exceed copies) */
const isNoFreeCopy = (err: unknown) => {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } }
  return (e.code ?? e.cause?.code) === '23514' && (e.constraint ?? e.cause?.constraint ?? 'books_on_loan_within_copies') === 'books_on_loan_within_copies'
}

/** One SELECT for every loan list: loan + book + borrower + who lent it */
function loanQuery(db: Db, days: number) {
  return db.select({
    id: sql<string>`l.id`, bookId: sql<string>`l.book_id`, title: books.title, titleSinglish: books.titleSinglish, coverUrl: books.coverUrl,
    userId: sql<string>`l.user_id`, name: users.name, email: users.email,
    borrowedAt: sql<string>`l.borrowed_at`, returnedAt: sql<string | null>`l.returned_at`,
    lentByName: sql<string | null>`(select coalesce(u2.name, u2.email) from users u2 where u2.id = l.lent_by)`,
    days: daysOut, overdue: sql<boolean>`(l.returned_at is null and ${daysOut} > ${days})`,
  }).from(sql`loans l`).innerJoin(books, sql`${books.id} = l.book_id`).innerJoin(users, sql`${users.id} = l.user_id`)
}

adminLoanRoutes.openapi(createRoute({
  ...secured('Admin: lending'), method: 'get', path: '/', operationId: 'adminListLoans', summary: 'Loans (open first, longest out first)',
  request: { query: z.object({ status: z.enum(['open', 'overdue', 'returned']).default('open') }) },
  responses: { 200: { description: 'Loans', content: { 'application/json': { schema: z.array(LoanRow) } } }, ...errors },
}), async (c) => {
  const { status } = c.req.valid('query'); const days = loanDays(c.env)
  const where = status === 'returned' ? sql`l.returned_at is not null`
    : status === 'overdue' ? sql`l.returned_at is null and ${daysOut} > ${days}` : sql`l.returned_at is null`
  const rows = await loanQuery(c.get('db'), days).where(where)
    .orderBy(status === 'returned' ? sql`l.returned_at desc` : sql`l.borrowed_at asc`).limit(200)
  return c.json(rows, 200)
})

adminLoanRoutes.openapi(createRoute({
  ...secured('Admin: lending'), method: 'get', path: '/summary', operationId: 'adminLoanSummary', summary: 'How many books are out / overdue',
  responses: { 200: { description: 'Counts', content: { 'application/json': { schema: LoanSummary } } }, ...errors },
}), async (c) => {
  const days = loanDays(c.env)
  const [row] = await c.get('db').select({
    open: sql<number>`count(*)::int`, overdue: sql<number>`(count(*) filter (where ${daysOut} > ${days}))::int`,
  }).from(sql`loans l`).where(sql`l.returned_at is null`)
  return c.json({ ...row, loanDays: days }, 200)
})

adminLoanRoutes.openapi(createRoute({
  ...secured('Admin: lending'), method: 'post', path: '/', operationId: 'adminLendBook', summary: 'Lend a copy of a book to a reader',
  request: { body: { required: true, content: { 'application/json': { schema: LendBody } } } },
  responses: { 201: { description: 'Lent', content: { 'application/json': { schema: LoanRow } } }, ...errors,
    404: problemResponse('No such book or reader'), 409: problemResponse('No free copy, reader not active, or they already have it') },
}), async (c) => {
  const { bookId, userId } = c.req.valid('json'); const db = c.get('db'); const me = c.get('user')!
  const [reader] = await db.select({ status: users.status, name: users.name, email: users.email }).from(users).where(eq(users.id, userId))
  if (!reader) return problem(c, 404, 'No such reader')
  if (reader.status !== 'active') return problem(c, 409, `${reader.name ?? reader.email} is not an active reader yet`)
  const [already] = await db.select({ id: loans.id }).from(loans).where(and(eq(loans.bookId, bookId), eq(loans.userId, userId), isNull(loans.returnedAt)))
  if (already) return problem(c, 409, `${reader.name ?? reader.email} already has this book`)

  // ONE statement, two steps: count the copy out (on_loan + 1), then create the loan.
  // Postgres locks the book row for the UPDATE, so a second "Lend" at the same moment waits,
  // then sees the new on_loan — and the CHECK (on_loan <= copies) refuses the extra copy.
  let id: string | undefined
  try {
    const inserted = await db.execute(sql`
      with taken as (update books set on_loan = on_loan + 1 where id = ${bookId} returning id)
      insert into loans (book_id, user_id, lent_by) select id, ${userId}, ${me.id} from taken
      returning id`)
    id = (inserted as unknown as { rows: { id: string }[] }).rows[0]?.id
  } catch (err) {
    if (!isNoFreeCopy(err)) throw err
    const [book] = await db.select({ title: books.title }).from(books).where(eq(books.id, bookId))
    return problem(c, 409, `All copies of "${book?.title ?? 'this book'}" are on loan`)
  }
  if (!id) return problem(c, 404, 'No such book')
  await audit(db, me.id, 'loan.lend', 'loan', id, { bookId, userId })
  const [row] = await loanQuery(db, loanDays(c.env)).where(sql`l.id = ${id}`)
  return c.json(row, 201)
})

adminLoanRoutes.openapi(createRoute({
  ...secured('Admin: lending'), method: 'post', path: '/{id}/return', operationId: 'adminReturnLoan', summary: 'The book came back',
  request: { params: LoanIdParam },
  responses: { 200: { description: 'Returned', content: { 'application/json': { schema: LoanRow } } }, ...errors,
    404: problemResponse('No such loan'), 409: problemResponse('Already returned') },
}), async (c) => {
  const { id } = c.req.valid('param'); const db = c.get('db'); const me = c.get('user')!
  // One statement: close the loan AND give the copy back (on_loan − 1).
  // "where returned_at is null" makes a double click harmless: the second one changes nothing.
  const done = await db.execute(sql`
    with closed as (update loans set returned_at = now(), returned_by = ${me.id}
                    where id = ${id} and returned_at is null returning book_id)
    update books set on_loan = on_loan - 1 from closed where books.id = closed.book_id returning books.id`)
  if (!(done as unknown as { rows: unknown[] }).rows.length) {
    const [exists] = await db.select({ id: loans.id }).from(loans).where(eq(loans.id, id))
    return exists ? problem(c, 409, 'This loan was already returned') : problem(c, 404, 'No such loan')
  }
  await audit(db, me.id, 'loan.return', 'loan', id)
  const [row] = await loanQuery(db, loanDays(c.env)).where(sql`l.id = ${id}`)
  return c.json(row, 200)
})

myLoanRoutes.openapi(createRoute({
  ...secured('My reading'), method: 'get', path: '/me/loans', operationId: 'myLoans', summary: 'Books I have now, and my last 20 returned',
  responses: { 200: { description: 'My loans', content: { 'application/json': { schema: z.object({ open: z.array(LoanRow), history: z.array(LoanRow), loanDays: z.number().int() }) } } }, 401: problemResponse('Not signed in') },
}), async (c) => {
  const me = c.get('user')!; const days = loanDays(c.env); const db = c.get('db')
  const [open, history] = await Promise.all([
    loanQuery(db, days).where(sql`l.user_id = ${me.id} and l.returned_at is null`).orderBy(sql`l.borrowed_at asc`),
    loanQuery(db, days).where(sql`l.user_id = ${me.id} and l.returned_at is not null`).orderBy(desc(sql`l.returned_at`)).limit(20),
  ])
  return c.json({ open, history, loanDays: days }, 200)
})
