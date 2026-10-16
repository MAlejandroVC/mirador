import { queryOptions } from '@tanstack/react-query'
import { api } from '../../../lib/api'

// SYS-13, SYS-21: the invite links the operator made.
export const invitesQuery = queryOptions({
  queryKey: ['invites'],
  queryFn: () => api.invites(),
})

// SYS-22: everyone with an account on the server.
export const peopleQuery = queryOptions({
  queryKey: ['people'],
  queryFn: () => api.people(),
})

// The link the operator sends. The code goes in the query, where the sign-up page
// picks it up.
export function inviteLink(code: string) {
  return `${window.location.origin}/sign-up?invite=${encodeURIComponent(code)}`
}

// SYS-21: a link chosen to expire on a date works until that day ends on this device.
export function endOfDay(date: string) {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number)
  return new Date(year, month - 1, day + 1).toISOString()
}
