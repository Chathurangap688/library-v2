/**
 * Lesson 2.2: a TYPED API client for the React app.
 * `schema.d.ts` is generated from the API's openapi.json (npm run api:types),
 * so every path, query parameter and response field is checked by TypeScript.
 *
 * Lesson 3.2: the session cookie is sent automatically (same origin). If ANY call
 * answers 401/403, we re-check "who am I?" so the app shows the login / pending screen.
 */
import createClient from 'openapi-fetch'
import type { components, paths } from './schema'
import { queryClient } from '../queryClient'

export const api = createClient<paths>({ baseUrl: '' })

api.use({
  onResponse({ request, response }) {
    if ((response.status === 401 || response.status === 403) && !request.url.endsWith('/api/me')) {
      queryClient.invalidateQueries({ queryKey: ['me'] })
    }
  },
})

// Handy names for the shapes the API returns
export type Book = components['schemas']['Book']
export type BookDetail = components['schemas']['BookDetail']
export type BookPage = components['schemas']['BookPage']
export type Category = components['schemas']['Category']
export type Me = components['schemas']['Me']
export type Problem = components['schemas']['Problem']
