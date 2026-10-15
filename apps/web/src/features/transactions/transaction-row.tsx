import { changeTo, type Money, toCalendarDate, type Transaction } from '@repo/core'
import { useTranslation } from 'react-i18next'
import { Amount } from '../../components/ui/amount'
import { IconTile } from '../../components/ui/icon-tile'
import {
  ArrowDownLeftIcon,
  ArrowsHorizontalIcon,
  ArrowUpRightIcon,
  FlagBannerIcon,
  type Icon,
  PercentIcon,
  ReceiptIcon,
  ScalesIcon,
  TrendUpIcon,
} from '../../components/ui/icons'
import { SwipeRow } from '../../components/ui/swipe-row'
import { formatDay, useMoney } from '../../lib/format'
import type { LedgerWallet } from '../wallets/use-ledger'

// The icon of each kind (DL-ICO-01). Expenses and income show their category's icon
// once categories arrive (CAT-02); until then, which way the money went. Transfers use
// arrows-horizontal, whose drawing has no box behind it (DL-ICO-03).
const kindIcons: Record<Transaction['kind'], Icon> = {
  openingBalance: FlagBannerIcon,
  adjustment: ScalesIcon,
  interest: PercentIcon,
  fee: ReceiptIcon,
  valuation: TrendUpIcon,
  expense: ArrowUpRightIcon,
  income: ArrowDownLeftIcon,
  transfer: ArrowsHorizontalIcon,
}

/**
 * One transaction as a list row (TXN-20): what it was, where, and its amount, signed
 * only when unusual (DL-NUM-03). In a wallet's own list (`walletId`), the second line is
 * its date and a transfer reads as money to or from the other wallet; in the
 * Transactions list, days are the section labels and the second line is the wallet.
 */
export function TransactionRow({
  transaction,
  wallets,
  defaultCurrency,
  walletId,
  onOpen,
  onDelete,
}: {
  transaction: Transaction
  wallets: ReadonlyMap<string, LedgerWallet>
  defaultCurrency: string
  walletId?: string
  onOpen: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
}) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  const source = wallets.get(transaction.walletId)
  const destination =
    transaction.toWalletId === undefined ? undefined : wallets.get(transaction.toWalletId)
  if (!source) return null
  const incoming = walletId !== undefined && walletId === transaction.toWalletId
  const shownWallet = (incoming ? destination : source) ?? source

  let title: string
  if (transaction.kind === 'transfer')
    title = incoming
      ? t('transactions.fromWallet', { name: source.name })
      : t('transactions.toWallet', { name: destination?.name ?? '' })
  else if (transaction.kind === 'expense' || transaction.kind === 'income')
    title = t(`transactions.types.${transaction.kind}`)
  else title = t(`wallets.transactions.${transaction.kind}`)
  // A note says best what it was; the kind or the other wallet goes under it.
  const trimmed = transaction.note?.trim()
  const note = trimmed === '' ? undefined : trimmed

  const details: string[] = []
  if (note) details.push(title)
  if (walletId === undefined) details.push(source.name)
  else
    details.push(
      formatDay(transaction.date, toCalendarDate(new Date()), money.locale, {
        today: t('dates.today'),
        yesterday: t('dates.yesterday'),
      }),
    )
  if (transaction.excludeFromBudget) details.push(t('transactions.notInBudget'))

  // DL-NUM-03: an expense or a transfer has no sign; income has a plus, in Moss
  // (DL-COL-07). What a wallet makes for itself shows which way it moved the balance.
  let value: Money
  let signs: 'negative' | 'always' = 'negative'
  let tone: 'text' | 'moss' = 'text'
  switch (transaction.kind) {
    case 'expense':
    case 'transfer':
      value = {
        minor: Math.abs(changeTo(transaction, shownWallet.id)),
        currency: shownWallet.currency,
      }
      break
    case 'income':
      value = { minor: transaction.amount, currency: source.currency }
      signs = 'always'
      tone = 'moss'
      break
    default:
      value = { minor: transaction.amount, currency: source.currency }
      signs = transaction.kind === 'openingBalance' ? 'negative' : 'always'
  }

  return (
    <SwipeRow
      id={transaction.id}
      // System transactions take Stone, the quietest category color (CAT-05).
      leading={<IconTile icon={kindIcons[transaction.kind]} color="stone" />}
      title={note ?? title}
      subtitle={details.join(' · ')}
      trailing={
        <Amount parts={money.parts(value, signs)} label={money.text(value, signs)} tone={tone} />
      }
      deleteLabel={t('transactions.deleteShort')}
      onClick={() => {
        onOpen(transaction)
      }}
      onDelete={() => {
        onDelete(transaction)
      }}
    />
  )
}
