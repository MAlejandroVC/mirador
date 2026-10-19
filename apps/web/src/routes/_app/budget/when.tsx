import { createFileRoute } from '@tanstack/react-router'
import { WhenScreen } from '../../../features/analysis'

export const Route = createFileRoute('/_app/budget/when')({
  component: WhenScreen,
})
