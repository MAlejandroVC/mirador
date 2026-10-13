import { createFileRoute } from '@tanstack/react-router'
import { requireUnlocked, SecurityScreen } from '../features/security'

export const Route = createFileRoute('/security')({
  beforeLoad: requireUnlocked,
  component: SecurityScreen,
})
