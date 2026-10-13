import { createFileRoute, redirect } from '@tanstack/react-router'
import { SignInScreen, sessionQuery } from '../features/security'

export const Route = createFileRoute('/sign-in')({
  beforeLoad: async ({ context }) => {
    if (await context.queryClient.query(sessionQuery)) throw redirect({ to: '/' })
  },
  component: SignInScreen,
})
