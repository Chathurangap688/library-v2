/**
 * Lesson 2.3: data hooks. TanStack Query fetches, CACHES and re-uses API answers:
 * going back to a page you saw a moment ago shows it instantly, no new request.
 * The "queryKey" is the cache label — same key = same cached answer.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { paths } from './schema'

export type BookFilters = NonNullable<paths['/api/books']['get']['parameters']['query']>

/** Turn an openapi-fetch answer into data, or throw the Problem Details message */
function unwrap<T>(res: { data?: T; error?: { detail?: string; title?: string } }): T {
  if (res.error || res.data === undefined) throw new Error(res.error?.detail ?? res.error?.title ?? 'Request failed')
  return res.data
}

export function useBooks(filters: BookFilters) {
  return useQuery({
    queryKey: ['books', filters],
    queryFn: async () => unwrap(await api.GET('/api/books', { params: { query: filters } })),
    placeholderData: keepPreviousData,     // keep showing the old page while the next one loads
  })
}

export function useBook(id: string) {
  return useQuery({
    queryKey: ['book', id],
    queryFn: async () => unwrap(await api.GET('/api/books/{id}', { params: { path: { id } } })),
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => unwrap(await api.GET('/api/categories')),
    staleTime: 10 * 60_000,                // categories rarely change: re-use for 10 minutes
  })
}

export function useLanguages() {
  return useQuery({
    queryKey: ['languages'],
    queryFn: async () => unwrap(await api.GET('/api/languages')),
    staleTime: 10 * 60_000,
  })
}

/** Lesson 3.2: who is signed in? null = nobody (the API answered 401) */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.GET('/api/me')
      if (res.response.status === 401) return null
      return unwrap(res)
    },
    staleTime: 60_000,
  })
}

// ---- Lesson 3.3: admin ----
export function useAdminUsers(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => unwrap(await api.GET('/api/admin/users')),
    enabled,
  })
}

type UserChange = { id: string; status?: 'pending' | 'active'; role?: 'user' | 'admin' }

/** A "mutation" changes data on the server; afterwards we refresh the cached user list */
export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: UserChange) =>
      unwrap(await api.PATCH('/api/admin/users/{id}', { params: { path: { id } }, body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.DELETE('/api/admin/users/{id}', { params: { path: { id } } })
      if (res.error) throw new Error(res.error.detail ?? 'Could not remove the user')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
}

// ---- Lesson 4.1: my reading ----
export type ReadingState = 'to_read' | 'reading' | 'read'
type MyBookState = { bookId: string; myStatus: ReadingState | null; myRating: number | null; myReview: string | null; avgRating: number | null; ratingCount: number }

export function useShelves() {
  return useQuery({ queryKey: ['shelves'], queryFn: async () => unwrap(await api.GET('/api/me/shelves')) })
}

/**
 * After a change we (1) patch the cached book page right away with the server's answer,
 * and (2) mark lists and shelf counts as stale so they reload in the background.
 */
function useAfterReadingChange() {
  const qc = useQueryClient()
  return (state: MyBookState) => {
    qc.setQueryData(['book', state.bookId], (old: object | undefined) => (old ? { ...old, ...state } : old))
    qc.invalidateQueries({ queryKey: ['book', state.bookId] })
    qc.invalidateQueries({ queryKey: ['books'] })
    qc.invalidateQueries({ queryKey: ['shelves'] })
  }
}

export function useSetStatus() {
  const after = useAfterReadingChange()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReadingState | null }) =>
      unwrap(await api.PUT('/api/books/{id}/status', { params: { path: { id } }, body: { status } })),
    onSuccess: after,
  })
}

export function useSetRating() {
  const after = useAfterReadingChange()
  return useMutation({
    mutationFn: async ({ id, rating, review }: { id: string; rating: number; review: string | null }) =>
      unwrap(await api.PUT('/api/books/{id}/rating', { params: { path: { id } }, body: { rating, review } })),
    onSuccess: after,
  })
}

export function useDeleteRating() {
  const after = useAfterReadingChange()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.DELETE('/api/books/{id}/rating', { params: { path: { id } } })),
    onSuccess: after,
  })
}

// ---- Lesson 4.2: recommendations (they change when I rate or shelve a book) ----
export function useRecommendations(limit = 8) {
  return useQuery({
    queryKey: ['books', 'recommendations', limit],     // starts with 'books' → refreshed after my changes
    queryFn: async () => unwrap(await api.GET('/api/me/recommendations', { params: { query: { limit } } })),
    staleTime: 5 * 60_000,
  })
}
