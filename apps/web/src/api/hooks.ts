/**
 * Lesson 2.3: data hooks. TanStack Query fetches, CACHES and re-uses API answers:
 * going back to a page you saw a moment ago shows it instantly, no new request.
 * The "queryKey" is the cache label — same key = same cached answer.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type BookInput } from './client'
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

export function useBook(id: string, enabled = true) {
  return useQuery({
    queryKey: ['book', id],
    enabled,
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

// ---- Lesson 4.3: admin — add / edit / remove books ----

/** A save can fail with field errors (400) or a duplicate (409): keep all of it for the form */
export class ApiError extends Error {
  status: number; errors: { field: string; message: string }[]; code?: string; duplicates?: { id: string; title: string }[]
  constructor(res: { response: Response; error?: unknown }) {
    const e = (res.error ?? {}) as { detail?: string; errors?: { field: string; message: string }[]; code?: string; duplicates?: { id: string; title: string }[] }
    super(e.detail ?? 'Request failed')
    this.status = res.response.status; this.errors = e.errors ?? []; this.code = e.code; this.duplicates = e.duplicates
  }
}

function useAfterBookChange() {
  const qc = useQueryClient()
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: ['books'] })
    qc.invalidateQueries({ queryKey: ['categories'] })
    qc.invalidateQueries({ queryKey: ['languages'] })
    if (id) qc.invalidateQueries({ queryKey: ['book', id] })
  }
}

export function useSaveBook() {
  const after = useAfterBookChange()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: BookInput }) => {
      const res = id
        ? await api.PATCH('/api/admin/books/{id}', { params: { path: { id } }, body: input })
        : await api.POST('/api/admin/books', { body: input })
      if (!res.data) throw new ApiError(res)
      return res.data
    },
    onSuccess: (book) => after(book.id),
  })
}

export function useAddCopy() {
  const after = useAfterBookChange()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.POST('/api/admin/books/{id}/copies', { params: { path: { id } } })),
    onSuccess: (book) => after(book.id),
  })
}

export function useDeleteBook() {
  const after = useAfterBookChange()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.DELETE('/api/admin/books/{id}', { params: { path: { id } } })
      if (res.error) throw new ApiError(res)
    },
    onSuccess: () => after(),
  })
}

export function useDuplicates(q: { title?: string; author?: string; isbn?: string; excludeId?: string }) {
  const enabled = Boolean((q.title && q.title.trim().length >= 2) || (q.isbn && q.isbn.replace(/\D/g, '').length >= 10))
  return useQuery({
    queryKey: ['duplicates', q],
    queryFn: async () => unwrap(await api.GET('/api/admin/books/duplicates', { params: { query: q } })),
    enabled,
    staleTime: 10_000,
  })
}

// ---- Lesson 4.4: covers + AI ----
export function useReadCover() {
  return useMutation({
    mutationFn: async (imageBase64: string) => unwrap(await api.POST('/api/admin/ai/read-cover', { body: { imageBase64, mimeType: 'image/jpeg' } })),
  })
}

type LookupBody = { title: string; author?: string | null; titleSinglish?: string | null; authorSinglish?: string | null; translator?: string | null;
  language?: string | null; isbn?: string | null; publisher?: string | null; isTranslation?: boolean; answerLanguage?: 'Sinhala' | 'English' | 'Tamil'; imageBase64?: string }
export function useLookup() {
  return useMutation({
    mutationFn: async (body: LookupBody) => unwrap(await api.POST('/api/admin/ai/lookup', { body: { answerLanguage: 'English', ...body } })),
  })
}

/** Raw image bytes (not JSON) → plain fetch; the session cookie goes along (same origin) */
export function useUploadCover() {
  return useMutation({
    mutationFn: async (blob: Blob) => {
      const res = await fetch('/api/admin/covers', { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: blob })
      const data = await res.json() as { url?: string; detail?: string }
      if (!res.ok || !data.url) throw new Error(data.detail ?? 'Upload failed')
      return data.url
    },
  })
}

// ---- Lesson 4.5: lending ----
export function useLoanSummary(enabled: boolean) {
  return useQuery({ queryKey: ['loans', 'summary'], enabled, queryFn: async () => unwrap(await api.GET('/api/admin/loans/summary')) })
}
export function useAdminLoans(status: 'open' | 'overdue' | 'returned') {
  return useQuery({ queryKey: ['loans', 'list', status], queryFn: async () => unwrap(await api.GET('/api/admin/loans', { params: { query: { status } } })) })
}
export function useMyLoans() {
  return useQuery({ queryKey: ['loans', 'mine'], queryFn: async () => unwrap(await api.GET('/api/me/loans')) })
}
function useAfterLoanChange() {
  const qc = useQueryClient()
  return (bookId: string) => {
    qc.invalidateQueries({ queryKey: ['loans'] })
    qc.invalidateQueries({ queryKey: ['books'] })
    qc.invalidateQueries({ queryKey: ['book', bookId] })
    qc.invalidateQueries({ queryKey: ['admin', 'users'] })     // "n on loan" on the Users page
  }
}
export function useLend() {
  const after = useAfterLoanChange()
  return useMutation({
    mutationFn: async (body: { bookId: string; userId: string }) => unwrap(await api.POST('/api/admin/loans', { body })),
    onSuccess: (loan) => after(loan.bookId),
  })
}
export function useReturnLoan() {
  const after = useAfterLoanChange()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.POST('/api/admin/loans/{id}/return', { params: { path: { id } } })),
    onSuccess: (loan) => after(loan.bookId),
  })
}
