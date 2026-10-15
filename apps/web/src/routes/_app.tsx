import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '../components/shell'
import { requireUnlocked } from '../features/security'

// Every screen behind sign-in sits in the app's frame (DL-LAY-06). Sign-in, unlock and
// recovery stay outside it.
export const Route = createFileRoute('/_app')({
  beforeLoad: requireUnlocked,
  component: AppShell,
})
