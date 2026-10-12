import { createFileRoute, redirect } from '@tanstack/react-router'
import { SignUpScreen, sessionQuery, signUpStatusQuery } from '../features/security'

export const Route = createFileRoute('/sign-up')({
  beforeLoad: async ({ context }) => {
    if (await context.queryClient.query(sessionQuery)) throw redirect({ to: '/' })
  },
  loader: ({ context }) => context.queryClient.query(signUpStatusQuery),
  component: SignUpScreen,
})
