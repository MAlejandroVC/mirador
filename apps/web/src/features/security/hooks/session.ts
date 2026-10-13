import { queryOptions } from '@tanstack/react-query'
import { api } from '../../../lib/api'

// Whether this browser has a session with the server. Being signed in is not the same
// as being unlocked: the keys live only in the worker's memory (SEC-12).
export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: () => api.session(),
  staleTime: Infinity,
})
