import { z } from 'zod'

// SYS-22, SYS-23: the operator can remove someone from the server. A removed account
// keeps its data for this long, only to download it (or to be restored by the
// operator); then the server deletes it.
export const removedAccessDays = 30

// GET /api/people. Every account on the server, oldest first. The operator sees only
// what the server already knows: usernames and dates, never anyone's data.
export const person = z.object({
  id: z.string(),
  username: z.string(),
  operator: z.boolean(),
  joinedAt: z.iso.datetime(),
  // Set while a removed account waits to be deleted.
  deletesAt: z.iso.datetime().nullable(),
})
export type Person = z.infer<typeof person>
export const peopleResponse = z.object({ people: z.array(person) })
export type PeopleResponse = z.infer<typeof peopleResponse>

// POST /api/people/:id/remove takes away their access to the app; they can still sign in to
// download their data until it is deleted.
// POST /api/people/:id/restore gives a removed account its access back.
export const peopleError = z.object({
  error: z.enum(['operator-only', 'cannot-remove-operator']),
})
export type PeopleError = z.infer<typeof peopleError>
