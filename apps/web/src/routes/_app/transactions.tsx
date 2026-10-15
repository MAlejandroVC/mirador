import { createFileRoute } from '@tanstack/react-router'
import { TransactionsScreen } from '../../features/transactions'

export const Route = createFileRoute('/_app/transactions')({
  component: TransactionsScreen,
})
