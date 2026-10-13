import { createFileRoute, redirect } from '@tanstack/react-router'
import { InvitesScreen, invitesQuery, requireUnlocked, sessionQuery } from '../features/security'

// SYS-13: only the person who runs the server invites people.
export const Route = createFileRoute('/invites')({
  beforeLoad: async (options) => {
    await requireUnlocked(options)
    const session = await options.context.queryClient.query(sessionQuery)
    if (!session?.user.operator) throw redirect({ to: '/' })
  },
  loader: ({ context }) => context.queryClient.query(invitesQuery),
  component: InvitesScreen,
})
