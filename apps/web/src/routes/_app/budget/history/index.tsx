import { createFileRoute } from '@tanstack/react-router'
import { HistoryScreen } from '../../../../features/budget/history-screen'

export const Route = createFileRoute('/_app/budget/history/')({
  component: HistoryScreen,
})
