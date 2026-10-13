import { createFileRoute, redirect } from '@tanstack/react-router'
import { SignInScreen, sessionQuery } from '../features/security'

// ?deleted=true after deleting the account, to say it is done.
export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>): { deleted?: true } =>
    search.deleted === true || search.deleted === 'true' ? { deleted: true } : {},
  beforeLoad: async ({ context }) => {
    if (await context.queryClient.query(sessionQuery)) throw redirect({ to: '/' })
  },
  component: SignInScreen,
})
