import { activePlans, type Transaction } from '@repo/core'
import { useTranslation } from 'react-i18next'
import { Amount } from '../../components/ui/amount'
import { IconTile } from '../../components/ui/icon-tile'
import { ArrowUpRightIcon } from '../../components/ui/icons'
import { List, RowBody } from '../../components/ui/list'
import { rowClass } from '../../components/ui/row'
import { useMoney } from '../../lib/format'
import { CategoryTile } from '../categories/category-tile'
import type { Taxonomy } from '../categories/lookups'
import type { LedgerWallet } from './use-ledger'

/**
 * WAL-25: a card's purchases still being billed in installments, newest first: what
 * each was, how far along it is as a bar and one sentence (DL-VIZ-01), and what it
 * bills each month. Each opens the purchase, where it can be paid off early (TXN-33).
 */
export function InstallmentPlans({
  wallet,
  transactions,
  taxonomy,
  today,
  defaultCurrency,
  onOpen,
}: {
  wallet: LedgerWallet
  transactions: readonly Transaction[]
  taxonomy: Taxonomy
  today: string
  defaultCurrency: string
  onOpen: (purchase: Transaction) => void
}) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  if (!wallet.credit) return null
  const plans = activePlans(wallet.id, transactions, wallet.credit.closingDay, today)
  if (plans.length === 0) return null
  const of = (minor: number) => money.text({ minor, currency: wallet.currency })
  return (
    <List label={t('installments.plans')}>
      {plans.map((plan) => {
        const { purchase } = plan
        const category = taxonomy.categoryOf(purchase)
        const payee =
          purchase.payeeId === undefined ? undefined : taxonomy.payees.get(purchase.payeeId)
        const note = purchase.note?.trim()
        const title = payee?.name ?? (note === '' ? undefined : note) ?? category?.name ?? ''
        const values = { billed: plan.billed, months: plan.months, left: of(plan.left) }
        return (
          <li key={purchase.id} className="group">
            <button
              type="button"
              onClick={() => {
                onOpen(purchase)
              }}
              className={rowClass}
            >
              <RowBody
                leading={
                  category ? (
                    <CategoryTile category={category} group={taxonomy.groupOf(category)} />
                  ) : (
                    <IconTile icon={ArrowUpRightIcon} color="stone" />
                  )
                }
                title={title}
                subtitle={
                  <span className="flex flex-col gap-1.5 pt-1">
                    <span aria-hidden className="block h-1 overflow-hidden rounded-full bg-fill">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${String((plan.billed / plan.months) * 100)}%`,
                          backgroundColor: `color-mix(in srgb, var(--mirador-${wallet.color}) var(--mirador-bar-mix), var(--mirador-surface))`,
                        }}
                      />
                    </span>
                    <span className="block truncate">
                      {plan.interest > 0
                        ? t('installments.progressInterest', values)
                        : t('installments.progress', values)}
                    </span>
                  </span>
                }
                trailing={
                  <span className="flex flex-col items-end">
                    <Amount
                      parts={money.parts({ minor: plan.monthly, currency: wallet.currency })}
                      label={of(plan.monthly)}
                    />
                    <span className="text-xs text-text-muted">{t('installments.aMonth')}</span>
                  </span>
                }
              />
            </button>
          </li>
        )
      })}
    </List>
  )
}
