import { createFileRoute } from '@tanstack/react-router'
import { NeedsAndWantsScreen } from '../../../features/categories'

export const Route = createFileRoute('/_app/settings/needs-and-wants')({
  component: NeedsAndWantsScreen,
})
