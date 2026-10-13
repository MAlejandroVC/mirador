import { queryOptions } from '@tanstack/react-query'
import { api } from '../../../lib/api'

// SYS-13: the invites the operator made.
export const invitesQuery = queryOptions({
  queryKey: ['invites'],
  queryFn: () => api.invites(),
})

// The link the operator sends. The code goes in the query, where the sign-up page
// picks it up.
export function inviteLink(code: string) {
  return `${window.location.origin}/sign-up?invite=${encodeURIComponent(code)}`
}
