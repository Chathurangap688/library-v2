// Lesson 2.1: shared types for the whole Worker.
import type { Db } from './db/client'

// Values Cloudflare gives the Worker (wrangler.jsonc "vars" + secrets)
export type Bindings = {
  PAGES_ORIGIN: string
  DATABASE_URL: string
}

// Hono "environment": Bindings + values we attach to each request (c.set / c.get)
export type AppEnv = {
  Bindings: Bindings
  Variables: { db: Db }
}
