import { createFileRoute, redirect } from '@tanstack/react-router'
import { RemovedScreen, sessionQuery } from '../features/security'

// SYS-23: a removed account sees only this screen, outside the app's frame. It needs
// the keys to download its data, so it unlocks first like any other screen.
export const Route = createFileRoute('/removed')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.query(sessionQuery)
    if (!session) throw redirect({ to: '/sign-in' })
    if (!session.user.removed) throw redirect({ to: '/' })
    if ((await context.vault.status()) === 'locked') throw redirect({ to: '/unlock' })
  },
  component: RemovedScreen,
})
