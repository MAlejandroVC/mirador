import { redirect } from '@tanstack/react-router'
import type { RouterContext } from '../../../routes/__root'
import { sessionQuery } from './session'

// Screens behind sign-in check the same two things: a session with the server, and
// keys in the worker's memory (SEC-12). A removed account gets only its own screen
// (SYS-23).
export async function requireUnlocked({ context }: { context: RouterContext }) {
  const session = await context.queryClient.query(sessionQuery)
  if (!session) throw redirect({ to: '/sign-in' })
  if ((await context.vault.status()) === 'locked') throw redirect({ to: '/unlock' })
  if (session.user.removed) throw redirect({ to: '/removed' })
}
