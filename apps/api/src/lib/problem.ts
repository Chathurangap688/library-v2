/**
 * Lesson 2.1: ONE error format for the whole API — "Problem Details" (RFC 9457).
 * Every error looks like:
 *   { "type": "about:blank", "title": "Bad Request", "status": 400,
 *     "detail": "pageSize: must be at most 100", "errors": [...] }
 * with Content-Type: application/problem+json. Clients (React, APIM, MCP) can rely on it.
 */
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

const TITLES: Record<number, string> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  409: 'Conflict', 422: 'Unprocessable Content', 500: 'Internal Server Error',
}

export function problem(c: Context, status: ContentfulStatusCode, detail?: string, extra?: Record<string, unknown>) {
  const body = { type: 'about:blank', title: TITLES[status] ?? 'Error', status, detail, ...extra }
  return c.body(JSON.stringify(body), status, { 'Content-Type': 'application/problem+json' })
}
