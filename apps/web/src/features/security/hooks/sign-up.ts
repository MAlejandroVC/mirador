import { queryOptions } from '@tanstack/react-query'
import { api } from '../../../lib/api'

// The password is the only thing between the encrypted data and someone who gets a
// copy of it, and nobody can reset it, so it has to be long.
export const minimumPasswordLength = 12

// SYS-13: whether this server takes new accounts, and how.
export const signUpStatusQuery = queryOptions({
  queryKey: ['sign-up-status'],
  queryFn: () => api.signUpStatus(),
})
