/**
 * The Worker entry point. Lesson 2.1: the routes now live in app.ts and routes/*.
 * Production uses the Neon HTTP driver.
 */
import { buildApp } from './app'
import { getDb } from './db/client'

export default buildApp((env) => getDb(env.DATABASE_URL))
