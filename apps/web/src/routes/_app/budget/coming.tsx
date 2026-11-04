import { createFileRoute } from '@tanstack/react-router'
import { ComingScreen } from '../../../features/analysis'

export const Route = createFileRoute('/_app/budget/coming')({
  component: ComingScreen,
})
