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
