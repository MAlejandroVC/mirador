import { createFileRoute, redirect } from '@tanstack/react-router'
import { InvitesScreen, invitesQuery, sessionQuery } from '../../../features/security'

// SYS-13: only the person who runs the server invites people.
export const Route = createFileRoute('/_app/settings/invites')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.query(sessionQuery)
    if (!session?.user.operator) throw redirect({ to: '/' })
  },
  loader: ({ context }) => context.queryClient.query(invitesQuery),
  component: InvitesScreen,
})
