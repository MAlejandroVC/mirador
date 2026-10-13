import { z } from 'zod'

// SYS-13: the server's operator (whoever created its first account) invites people.
// Mirador sends no mail (NFR-05), so the operator shares the link themselves. An
// invite works once and only for a week.

export const inviteLifetimeDays = 7

// GET /api/invites. The operator's invites, newest first. The code is never in here:
// the server keeps only its hash, so it can't show it again.
export const invite = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  // Set once someone signed up with it.
  usedAt: z.iso.datetime().nullable(),
  usedBy: z.string().nullable(),
})
export type Invite = z.infer<typeof invite>
export const invitesResponse = z.object({ invites: z.array(invite) })
export type InvitesResponse = z.infer<typeof invitesResponse>

// POST /api/invites. A new invite and its code, shown this once.
export const newInviteResponse = z.object({
  invite,
  code: z.string(),
})
export type NewInviteResponse = z.infer<typeof newInviteResponse>

// DELETE /api/invites/:id withdraws an invite nobody has used yet.
