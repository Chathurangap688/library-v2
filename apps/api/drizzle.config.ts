// Lesson 1.2: settings for drizzle-kit (the command-line tool that makes and runs migrations).
// It runs on YOUR computer (Node), so it reads DATABASE_URL from .dev.vars — never from Git.
import { defineConfig } from 'drizzle-kit'

try { process.loadEnvFile('.dev.vars') } catch { /* in CI the variable comes from the environment */ }

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',                      // generated .sql migration files (commit these)
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,                          // ask before anything that could lose data
})
