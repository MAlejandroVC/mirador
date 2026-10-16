import { createFileRoute, redirect } from '@tanstack/react-router'
import { invitesQuery, PeopleScreen, peopleQuery, sessionQuery } from '../../../features/security'

// SYS-13, SYS-22: only the person who runs the server invites and removes people.
export const Route = createFileRoute('/_app/settings/people')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.query(sessionQuery)
    if (!session?.user.operator) throw redirect({ to: '/' })
  },
  loader: ({ context }) =>
    Promise.all([context.queryClient.query(invitesQuery), context.queryClient.query(peopleQuery)]),
  component: PeopleScreen,
})
