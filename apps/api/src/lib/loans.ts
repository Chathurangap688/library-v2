/**
 * Lesson 4.5: lending rules in one place.
 * A loan is "overdue" after LOAN_DAYS (default 14, like v1) — set it in wrangler.jsonc vars.
 */
import { sql } from 'drizzle-orm'

export const loanDays = (env: { LOAN_DAYS?: string }) => Math.max(1, Number(env.LOAN_DAYS) || 14)

/** Whole days since the book was borrowed (until returned, or until now) */
export const daysOut = sql<number>`floor(extract(epoch from (coalesce(l.returned_at, now()) - l.borrowed_at)) / 86400)::int`
