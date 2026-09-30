// Lesson 2.3/3.2: the ONE cache for all API data (shared by main.tsx and the API client)
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})
