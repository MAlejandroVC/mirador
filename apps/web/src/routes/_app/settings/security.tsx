import { createFileRoute } from '@tanstack/react-router'
import { SecurityScreen } from '../../../features/security'

// Settings > Password and security (SEC-08, SEC-12, SYS-06). The _app route has already
// checked that the app is unlocked.
export const Route = createFileRoute('/_app/settings/security')({
  component: SecurityScreen,
})
