import { walletTransactions } from '@repo/core'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { IconTile } from '../../components/ui/icon-tile'
import { WalletIcon } from '../../components/ui/icons'
import { Page } from '../../components/ui/page'
import { useTransactionEditor } from '../transactions/use-transaction-editor'
import { TransactionRows } from './transaction-list'
import { useLedger } from './use-ledger'
import { walletIconComponents } from './wallet-look'

// WAL-05: all of a wallet's transactions, opened from "See more" on the wallet's page,
// newest first; each opens to be changed or deleted.
export function WalletTransactionsScreen({ walletId }: { walletId: string }) {
  const { t } = useTranslation()
  const { data: ledger } = useLedger()
  const defaultCurrency = ledger?.defaultCurrency ?? 'USD'
  const wallet = ledger?.wallets.find((candidate) => candidate.id === walletId)
  const editor = useTransactionEditor()
  const back = useBack(
    wallet?.name ?? t('nav.wallets'),
    wallet ? { to: '/wallets/$walletId', params: { walletId: wallet.id } } : { to: '/wallets' },
  )

  if (!ledger) return null
  if (!wallet)
    return (
      <Page
        title={t('wallets.missing.title')}
        back={back}
        card={{
          icon: <IconTile icon={WalletIcon} size="large" />,
          description: t('wallets.missing.body'),
        }}
      />
    )

  return (
    <Page
      title={t('wallets.transactions.title')}
      back={back}
      card={{
        icon: (
          <IconTile icon={walletIconComponents[wallet.icon]} color={wallet.color} size="large" />
        ),
        description: wallet.name,
      }}
    >
      <TransactionRows
        wallet={wallet}
        wallets={ledger.wallets}
        transactions={walletTransactions(wallet.id, ledger.transactions)}
        defaultCurrency={defaultCurrency}
        onOpen={(transaction) => {
          editor.open(transaction)
        }}
        onDelete={editor.remove}
      />
      {editor.sheet}
    </Page>
  )
}
