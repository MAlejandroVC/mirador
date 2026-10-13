import { createFileRoute, redirect } from '@tanstack/react-router'
import { RecoverScreen } from '../features/security'

// Open whether signed in or not: someone locked out on this device may still be signed in.
export const Route = createFileRoute('/recover')({
  beforeLoad: async ({ context }) => {
    if ((await context.vault.status()) === 'unlocked') throw redirect({ to: '/' })
  },
  component: RecoverScreen,
})
