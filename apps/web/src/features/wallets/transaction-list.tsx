import type { Transaction } from '@repo/core'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CaretRightIcon } from '../../components/ui/icons'
import { List } from '../../components/ui/list'
import { taxonomy } from '../categories/lookups'
import { TransactionRow } from '../transactions/transaction-row'
import { type LedgerWallet, useLedger } from './use-ledger'

/**
 * A wallet's transactions, transfers into it included, newest first. With `limit`,
 * only that many, and a "See more" row that opens the wallet's full list.
 */
export function TransactionRows({
  wallet,
  wallets,
  transactions,
  defaultCurrency,
  limit,
  label,
  onOpen,
  onDelete,
}: {
  wallet: LedgerWallet
  wallets: readonly LedgerWallet[]
  transactions: readonly Transaction[]
  defaultCurrency: string
  limit?: number
  label?: string
  onOpen: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
}) {
  const { t } = useTranslation()
  const { data: ledger } = useLedger()
  const byId = new Map(wallets.map((each) => [each.id, each]))
  const lookups = taxonomy(ledger ?? { groups: [], categories: [], tags: [], payees: [] })
  const shown = limit === undefined ? transactions : transactions.slice(0, limit)
  return (
    <List {...(label ? { label } : {})}>
      {shown.map((transaction) => (
        <TransactionRow
          key={transaction.id}
          transaction={transaction}
          wallets={byId}
          taxonomy={lookups}
          walletId={wallet.id}
          defaultCurrency={defaultCurrency}
          onOpen={onOpen}
          onDelete={onDelete}
        />
      ))}
      {shown.length < transactions.length && (
        <li className="group">
          {/* DL-CMP-07: it opens another screen, so it has a chevron. */}
          <Link
            to="/wallets/$walletId/transactions"
            params={{ walletId: wallet.id }}
            className="flex min-h-11 w-full items-center gap-2 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
          >
            <span className="flex min-h-11 flex-1 items-center gap-2 self-stretch border-t-[0.5px] border-separator pr-4 group-first:border-t-0">
              <span className="flex-1 text-[0.9375rem] text-brand">
                {t('wallets.transactions.seeMore')}
              </span>
              <CaretRightIcon aria-hidden className="size-4 text-text-faint" />
            </span>
          </Link>
        </li>
      )}
    </List>
  )
}
