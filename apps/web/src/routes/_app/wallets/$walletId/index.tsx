import { createFileRoute } from '@tanstack/react-router'
import { WalletScreen } from '../../../../features/wallets'

export const Route = createFileRoute('/_app/wallets/$walletId/')({
  component: Wallet,
})

function Wallet() {
  const { walletId } = Route.useParams()
  return <WalletScreen walletId={walletId} />
}
