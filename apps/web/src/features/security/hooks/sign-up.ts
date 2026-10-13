import { queryOptions } from '@tanstack/react-query'
import { api } from '../../../lib/api'

// SYS-13: whether this server takes new accounts, and how.
export const signUpStatusQuery = queryOptions({
  queryKey: ['sign-up-status'],
  queryFn: () => api.signUpStatus(),
})
