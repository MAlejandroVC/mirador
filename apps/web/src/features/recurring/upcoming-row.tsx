import type { Recurring } from '@repo/core'
import { useTranslation } from 'react-i18next'
import { Amount } from '../../components/ui/amount'
import { IconTile } from '../../components/ui/icon-tile'
import { ArrowCircleRightIcon, ArrowsClockwiseIcon } from '../../components/ui/icons'
import { rowClass } from '../../components/ui/row'
import { RowBody } from '../../components/ui/list'
import { useMoney } from '../../lib/format'
import { CategoryTile } from '../categories/category-tile'
import type { Taxonomy } from '../categories/lookups'
import type { LedgerWallet } from '../wallets/use-ledger'

/**
 * TXN-09: a recurring transaction as a list row: what it is, as a transaction's row
 * says it (DL-CMP-07), with when it comes next, or that it waits to be checked
 * (TXN-10). It hasn't happened, so its amount is muted (DL-NUM-03); income keeps its
 * plus.
 */
export function RecurringRow({
  recurring,
  detail,
  wallets,
  taxonomy,
  defaultCurrency,
  onOpen,
}: {
  recurring: Recurring
  /** The line under the title, such as "Oct 20 · Every month". */
  detail: string
  wallets: ReadonlyMap<string, LedgerWallet>
  taxonomy: Taxonomy
  defaultCurrency: string
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  const source = wallets.get(recurring.walletId)
  const destination =
    recurring.toWalletId === undefined ? undefined : wallets.get(recurring.toWalletId)
  const transfer = recurring.kind === 'transfer'
  const category = transfer ? null : taxonomy.categoryOf(recurring)
  const payee = recurring.payeeId === undefined ? undefined : taxonomy.payees.get(recurring.payeeId)
  const trimmed = recurring.note?.trim()
  const note = trimmed === '' ? undefined : trimmed
  const title = transfer
    ? t('transactions.between', { from: source?.name ?? '', to: destination?.name ?? '' })
    : (payee?.name ?? note ?? category?.name ?? t(`transactions.types.${recurring.kind}`))
  const value = { minor: Math.abs(recurring.amount), currency: source?.currency ?? defaultCurrency }
  const signs = recurring.kind === 'income' ? 'always' : 'negative'
  return (
    <li className="group">
      <button type="button" onClick={onOpen} className={rowClass}>
        <RowBody
          leading={
            category ? (
              <CategoryTile category={category} group={taxonomy.groupOf(category)} />
            ) : (
              <IconTile
                icon={transfer ? ArrowCircleRightIcon : ArrowsClockwiseIcon}
                color="stone"
              />
            )
          }
          title={title}
          subtitle={<span className="block truncate">{detail}</span>}
          trailing={
            <Amount
              parts={money.parts(value, signs)}
              label={money.text(value, signs)}
              tone="muted"
            />
          }
        />
      </button>
    </li>
  )
}
