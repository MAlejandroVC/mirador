import { createFileRoute } from '@tanstack/react-router'
import { WalletTransactionsScreen } from '../../../../features/wallets'

export const Route = createFileRoute('/_app/wallets/$walletId/transactions')({
  component: WalletTransactions,
})

function WalletTransactions() {
  const { walletId } = Route.useParams()
  return <WalletTransactionsScreen walletId={walletId} />
}
