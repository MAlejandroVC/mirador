import { type QueryClient, queryOptions } from '@tanstack/react-query'
import { api } from '../../../lib/api'

// Whether this browser has a session with the server. Being signed in is not the same
// as being unlocked: the keys live only in the worker's memory (SEC-12).
export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: () => api.session(),
  staleTime: Infinity,
})

// SEC-12: what the page read while unlocked, decrypted data included, stays in the
// query cache until it is removed. Locking removes all of it but who is signed in;
// signing out removes everything.
export function forgetUnlocked(queryClient: QueryClient) {
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== sessionQuery.queryKey[0],
  })
}

export function forgetAll(queryClient: QueryClient) {
  queryClient.removeQueries()
}
