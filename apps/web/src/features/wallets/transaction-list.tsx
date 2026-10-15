import { toCalendarDate, type Transaction } from '@repo/core'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Amount } from '../../components/ui/amount'
import { IconTile } from '../../components/ui/icon-tile'
import {
  CaretRightIcon,
  FlagBannerIcon,
  type Icon,
  PercentIcon,
  ReceiptIcon,
  ScalesIcon,
  TrendUpIcon,
} from '../../components/ui/icons'
import { List, ListButtonRow } from '../../components/ui/list'
import { formatDay, useMoney } from '../../lib/format'
import type { LedgerWallet } from './use-ledger'

// The icon of each kind of transaction the wallets epic makes (DL-ICO-01).
const kindIcons: Record<Transaction['kind'], Icon> = {
  openingBalance: FlagBannerIcon,
  adjustment: ScalesIcon,
  interest: PercentIcon,
  fee: ReceiptIcon,
  valuation: TrendUpIcon,
}

/**
 * A wallet's transactions, newest first. With `limit`, only that many, and a "See more"
 * row that opens the wallet's full list.
 */
export function TransactionRows({
  wallet,
  transactions,
  defaultCurrency,
  limit,
  label,
  onOpen,
}: {
  wallet: LedgerWallet
  transactions: readonly Transaction[]
  defaultCurrency: string
  limit?: number
  label?: string
  onOpen: (transaction: Transaction) => void
}) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  const today = toCalendarDate(new Date())
  const shown = limit === undefined ? transactions : transactions.slice(0, limit)
  return (
    <List {...(label ? { label } : {})}>
      {shown.map((transaction) => {
        const value = { minor: transaction.amount, currency: wallet.currency }
        const signs = transaction.kind === 'openingBalance' ? 'negative' : 'always'
        const KindIcon = kindIcons[transaction.kind]
        return (
          <ListButtonRow
            key={transaction.id}
            id={transaction.id}
            tone="text"
            // System transactions (CAT-05) take Stone, the quietest category color.
            leading={<IconTile icon={KindIcon} color="stone" />}
            title={transaction.note ?? t(`wallets.transactions.${transaction.kind}`)}
            subtitle={formatDay(transaction.date, today, money.locale, {
              today: t('dates.today'),
              yesterday: t('dates.yesterday'),
            })}
            trailing={<Amount parts={money.parts(value, signs)} label={money.text(value, signs)} />}
            onClick={() => {
              onOpen(transaction)
            }}
          />
        )
      })}
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
