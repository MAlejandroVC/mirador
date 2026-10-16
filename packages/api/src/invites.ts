import { z } from 'zod'

// SYS-13, SYS-21: the server's operator (whoever created its first account) invites
// people. Mirador sends no mail (NFR-05), so the operator shares the link themselves.
// One link can be for one person or for many: it works until its expiry date, until
// it was used as many times as allowed, or until the operator ends it.

// What a new link offers before the operator changes anything.
export const inviteDefaultDays = 7
export const inviteDefaultUses = 1
// The furthest a link can expire, so a forgotten one doesn't stay open for good.
export const inviteMaxDays = 365
export const inviteMaxUses = 1000

// POST /api/invites. `maxUses` null means anyone with the link until it expires.
export const newInviteRequest = z.object({
  expiresAt: z.iso.datetime(),
  maxUses: z.int().min(1).max(inviteMaxUses).nullable(),
})
export type NewInviteRequest = z.infer<typeof newInviteRequest>

// GET /api/invites. The operator's invites, newest first. The code is never in here:
// the server keeps only its hash, so it can't show it again.
export const invite = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  // Set when the operator ended it early.
  endedAt: z.iso.datetime().nullable(),
  maxUses: z.int().positive().nullable(),
  useCount: z.int().nonnegative(),
  // Who signed up with it and still has an account, oldest first.
  joined: z.array(z.string()),
})
export type Invite = z.infer<typeof invite>
export const invitesResponse = z.object({ invites: z.array(invite) })
export type InvitesResponse = z.infer<typeof invitesResponse>

// POST /api/invites returns the new invite and its code, shown this once.
export const newInviteResponse = z.object({
  invite,
  code: z.string(),
})
export type NewInviteResponse = z.infer<typeof newInviteResponse>

// POST /api/invites/:id/end stops a link from working, whoever still has it.

// Whether a link can still sign someone up, as of `now`.
export function inviteIsOpen(invite: Invite, now: number) {
  return (
    !invite.endedAt &&
    Date.parse(invite.expiresAt) > now &&
    (invite.maxUses === null || invite.useCount < invite.maxUses)
  )
}
