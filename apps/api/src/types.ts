// Lesson 2.1 + 3.2: shared types for the whole Worker.
import type { Db } from './db/client'

// Values Cloudflare gives the Worker (wrangler.jsonc "vars", secrets and KV)
export type Bindings = {
  PAGES_ORIGIN: string
  DATABASE_URL: string            // secret
  // Lesson 3.2: login with Asgardeo
  APP_ORIGIN: string              // where users open the app, e.g. https://library.….workers.dev
  ASGARDEO_ORG: string            // "mylibrary"
  ASGARDEO_CLIENT_ID: string
  ASGARDEO_CLIENT_SECRET: string  // secret
  ASGARDEO_BASE_URL?: string      // only for tests (a fake Asgardeo on localhost)
  ADMIN_EMAILS?: string           // comma separated: always admin + active
  SESSIONS: KVNamespace           // login sessions
}

// The signed-in user, as the API sees them (loaded from OUR database on every request)
export type SessionUser = {
  id: string
  email: string
  name: string | null
  picture: string | null
  role: 'user' | 'admin'
  status: 'pending' | 'active'
}

// Hono "environment": Bindings + values attached to each request (c.set / c.get)
export type AppEnv = {
  Bindings: Bindings
  Variables: { db: Db; user: SessionUser | null; sessionId: string | null }
}
