import { createFileRoute } from '@tanstack/react-router'
import { TrendsScreen } from '../../../features/analysis'

export const Route = createFileRoute('/_app/budget/trends')({
  component: TrendsScreen,
})
