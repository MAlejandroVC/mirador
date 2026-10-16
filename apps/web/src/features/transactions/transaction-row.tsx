import {
  changeTo,
  type Money,
  type SpendingEntry,
  toCalendarDate,
  type Transaction,
} from '@repo/core'
import { useTranslation } from 'react-i18next'
import { Amount } from '../../components/ui/amount'
import { IconTile } from '../../components/ui/icon-tile'
import {
  ArrowDownLeftIcon,
  ArrowCircleRightIcon,
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
import { CategoryTile } from '../categories/category-tile'
import type { Taxonomy } from '../categories/lookups'
import type { LedgerWallet } from '../wallets/use-ledger'

// The icon of each kind with no category to show (DL-ICO-01): what a wallet makes for
// itself, and transfers, an arrow in a circle whose outline holds its shading
// (DL-ICO-03).
const kindIcons: Record<Transaction['kind'], Icon> = {
  openingBalance: FlagBannerIcon,
  adjustment: ScalesIcon,
  interest: PercentIcon,
  fee: ReceiptIcon,
  valuation: TrendUpIcon,
  expense: ArrowUpRightIcon,
  income: ArrowDownLeftIcon,
  transfer: ArrowCircleRightIcon,
}

/**
 * One transaction as a list row (TXN-20). The amount says what kind it is (DL-NUM-03):
 * income has a plus in Moss, an expense has no sign, and a transfer is muted, since
 * the money only moved between the person's own wallets. So the row shows no type:
 * its title is the payee, the note or the category, and the line under it the
 * category and the wallet, or "Checking → Credit card" for a transfer. In a wallet's
 * own list (`walletId`), the date takes the wallet's place and a transfer reads as
 * money to or from the other wallet. One installment of a purchase (TXN-32) says which
 * one it is, "2 of 6", and the purchase in a wallet's list says over how many months.
 */
export function TransactionRow({
  transaction,
  wallets,
  taxonomy,
  defaultCurrency,
  walletId,
  showDate,
  onOpen,
  onDelete,
}: {
  transaction: SpendingEntry<Transaction>
  wallets: ReadonlyMap<string, LedgerWallet>
  taxonomy: Taxonomy
  defaultCurrency: string
  walletId?: string
  /** In a list not grouped by day, the date joins the second line. */
  showDate?: boolean
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
  const transfer = transaction.kind === 'transfer'
  const category = taxonomy.categoryOf(transaction)
  const group = category ? taxonomy.groupOf(category) : undefined
  const payee =
    transaction.payeeId === undefined ? undefined : taxonomy.payees.get(transaction.payeeId)
  const trimmed = transaction.note?.trim()
  const note = trimmed === '' ? undefined : trimmed

  // What it is, in the fewest words: who it was with, else the note, else the category.
  let kindTitle: string
  if (transfer)
    kindTitle =
      walletId === undefined
        ? t('transactions.types.transfer')
        : incoming
          ? t('transactions.fromWallet', { name: source.name })
          : t('transactions.toWallet', { name: destination?.name ?? '' })
  else if (transaction.kind === 'expense' || transaction.kind === 'income')
    kindTitle = category?.name ?? t(`transactions.types.${transaction.kind}`)
  else kindTitle = t(`wallets.transactions.${transaction.kind}`)
  const title = payee?.name ?? note ?? kindTitle

  const details: string[] = []
  const part = transaction.part
  if (part)
    details.push(
      part.last > part.number
        ? t('installments.parts', { number: part.number, last: part.last, of: part.of })
        : t('installments.part', { number: part.number, of: part.of }),
    )
  else if (transaction.installments)
    details.push(t('installments.inMonths', { count: transaction.installments.months }))
  if (title !== kindTitle && !(transfer && walletId === undefined)) details.push(kindTitle)
  const day = formatDay(transaction.date, toCalendarDate(new Date()), money.locale, {
    today: t('dates.today'),
    yesterday: t('dates.yesterday'),
  })
  if (walletId === undefined)
    details.push(
      transfer
        ? t('transactions.between', { from: source.name, to: destination?.name ?? '' })
        : source.name,
    )
  if (walletId !== undefined || showDate) details.push(day)
  for (const tagId of transaction.tagIds ?? []) {
    const tag = taxonomy.tags.get(tagId)
    if (tag) details.push(tag.name)
  }
  if (transaction.excludeFromBudget) details.push(t('transactions.notInBudget'))

  // DL-NUM-03: an expense has no sign; income has a plus, in Moss (DL-COL-07); a
  // transfer has no sign and is muted. What a wallet makes for itself shows which way
  // it moved the balance.
  let value: Money
  let signs: 'negative' | 'always' = 'negative'
  let tone: 'text' | 'moss' | 'muted' = 'text'
  switch (transaction.kind) {
    case 'expense':
      value = { minor: -transaction.amount, currency: source.currency }
      break
    case 'transfer':
      value = {
        minor: Math.abs(changeTo(transaction, shownWallet.id)),
        currency: shownWallet.currency,
      }
      tone = 'muted'
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
      leading={
        category && !transfer ? (
          <CategoryTile category={category} group={group} />
        ) : (
          // Without a category, Stone, the quietest color (CAT-05).
          <IconTile icon={kindIcons[transaction.kind]} color="stone" />
        )
      }
      title={title}
      // DL-CMP-07: one line, like iOS; the full detail is a tap away.
      {...(details.length > 0
        ? { subtitle: <span className="block truncate">{details.join(' · ')}</span> }
        : {})}
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
