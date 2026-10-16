import { walletTransactions } from '@repo/core'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
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
  const navigate = useNavigate()
  const { data: ledger } = useLedger()
  const defaultCurrency = ledger?.defaultCurrency ?? 'USD'
  const wallet = ledger?.wallets.find((candidate) => candidate.id === walletId)
  const editor = useTransactionEditor()

  if (!ledger) return null
  if (!wallet)
    return (
      <Page
        title={t('wallets.missing.title')}
        back={{
          label: t('nav.wallets'),
          onClick: () => {
            void navigate({ to: '/wallets' })
          },
        }}
        card={{
          icon: <IconTile icon={WalletIcon} size="large" />,
          description: t('wallets.missing.body'),
        }}
      />
    )

  return (
    <Page
      title={t('wallets.transactions.title')}
      back={{
        label: wallet.name,
        onClick: () => {
          void navigate({ to: '/wallets/$walletId', params: { walletId: wallet.id } })
        },
      }}
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
