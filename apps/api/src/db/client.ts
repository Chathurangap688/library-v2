/**
 * Lesson 1.2 — one database connection helper for the whole Worker.
 * neon-http sends each query as an HTTPS request: it works in Workers without
 * keeping a TCP connection open, which suits a Worker that starts per request.
 */
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

export function getDb(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema })
}
export type Db = ReturnType<typeof getDb>
