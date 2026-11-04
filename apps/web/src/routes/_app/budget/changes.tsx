import { createFileRoute } from '@tanstack/react-router'
import { ChangesScreen } from '../../../features/analysis'

export const Route = createFileRoute('/_app/budget/changes')({
  component: ChangesScreen,
})
