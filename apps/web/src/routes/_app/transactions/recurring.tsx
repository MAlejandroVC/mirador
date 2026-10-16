import { createFileRoute } from '@tanstack/react-router'
import { RecurringScreen } from '../../../features/recurring'

export const Route = createFileRoute('/_app/transactions/recurring')({
  component: RecurringScreen,
})
