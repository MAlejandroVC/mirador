import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionQuery, UnlockScreen } from '../features/security'

export const Route = createFileRoute('/unlock')({
  beforeLoad: async ({ context }) => {
    if (!(await context.queryClient.query(sessionQuery))) {
      throw redirect({ to: '/sign-in' })
    }
    if ((await context.vault.status()) === 'unlocked') throw redirect({ to: '/' })
  },
  component: UnlockScreen,
})
