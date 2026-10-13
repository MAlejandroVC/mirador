import { createFileRoute, redirect } from '@tanstack/react-router'
import { SignUpScreen, sessionQuery, signUpStatusQuery } from '../features/security'

// SYS-13: an invite link opens this page with its code, ?invite=…
export const Route = createFileRoute('/sign-up')({
  validateSearch: (search: Record<string, unknown>): { invite?: string } =>
    typeof search.invite === 'string' ? { invite: search.invite } : {},
  beforeLoad: async ({ context }) => {
    if (await context.queryClient.query(sessionQuery)) throw redirect({ to: '/' })
  },
  loader: ({ context }) => context.queryClient.query(signUpStatusQuery),
  component: SignUpScreen,
})
