/**
 * Lesson 2.2: a TYPED API client for the React app.
 * `schema.d.ts` is generated from the API's openapi.json (npm run api:types),
 * so every path, query parameter and response field is checked by TypeScript:
 * a typo like api.GET('/api/bookz') or data.items[0].titel is a compile error.
 */
import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

// Same origin as the page ('/api/...'): the Worker serves both, so no CORS and no base URL
export const api = createClient<paths>({ baseUrl: '' })

// Handy names for the shapes the API returns
export type Book = components['schemas']['Book']
export type BookDetail = components['schemas']['BookDetail']
export type BookPage = components['schemas']['BookPage']
export type Category = components['schemas']['Category']
export type Problem = components['schemas']['Problem']
