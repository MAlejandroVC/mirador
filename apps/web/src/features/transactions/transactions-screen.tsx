import { byDay, newestFirst, spent, toCalendarDate } from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountButton } from '../../components/shell'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { ReceiptIcon } from '../../components/ui/icons'
import { List } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { formatDay, useMoney } from '../../lib/format'
import { useQuickAdd } from '../quick-add'
import { useLedger } from '../wallets/use-ledger'
import { TransactionRow } from './transaction-row'
import { useTransactionEditor } from './use-transaction-editor'

// How many rows show at first, and how many more each "Show more" adds.
const page = 100

// Epic 2: every transaction in one list, newest first, grouped by day with what was
// spent that day (TXN-20, TXN-28). Tapping one opens it to change or delete it;
// swiping it left deletes it, with Undo (DL-CMP-07, TXN-13). Sorting, filters and
// totals for a filtered set join this screen next (TXN-21 to TXN-26).
export function TransactionsScreen() {
  const { t } = useTranslation()
  const { data: ledger } = useLedger()
  const quickAdd = useQuickAdd()
  const editor = useTransactionEditor()
  const [limit, setLimit] = useState(page)
  const defaultCurrency = ledger?.defaultCurrency ?? 'USD'
  const money = useMoney(defaultCurrency)

  if (!ledger) return <Page title={t('nav.transactions')} actions={<AccountButton />} />

  const wallets = new Map(ledger.wallets.map((wallet) => [wallet.id, wallet]))
  const currencies = new Map(ledger.wallets.map((wallet) => [wallet.id, wallet.currency]))
  // A transaction whose wallet is gone has nowhere to show (WAL-08 deletes them too).
  const all = newestFirst(
    ledger.transactions.filter((transaction) => wallets.has(transaction.walletId)),
  )

  if (all.length === 0)
    return (
      <Page title={t('nav.transactions')} actions={<AccountButton />}>
        {/* DL-CMP-14, DL-VOC-02: a touch of whimsy where nothing is there yet. */}
        <EmptyState
          icon={ReceiptIcon}
          title={t('transactions.empty.title')}
          action={
            <Button className="mt-1 px-6" onClick={quickAdd.open}>
              {t('transactions.empty.action')}
            </Button>
          }
        >
          {t('transactions.empty.body')}
        </EmptyState>
        {editor.sheet}
      </Page>
    )

  const today = toCalendarDate(new Date())
  const words = { today: t('dates.today'), yesterday: t('dates.yesterday') }
  const days = byDay(all.slice(0, limit))

  return (
    <Page title={t('nav.transactions')} actions={<AccountButton />}>
      {days.map((day) => {
        const total = spent(day.transactions, currencies, defaultCurrency, ledger.rates)
        return (
          <List
            key={day.date}
            label={formatDay(day.date, today, money.locale, words)}
            {...(total > 0
              ? {
                  detail: t('transactions.daySpent', {
                    amount: money.text({ minor: total, currency: defaultCurrency }),
                  }),
                }
              : {})}
          >
            {day.transactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                wallets={wallets}
                defaultCurrency={defaultCurrency}
                onOpen={(opened) => {
                  editor.open(opened)
                }}
                onDelete={editor.remove}
              />
            ))}
          </List>
        )
      })}
      {all.length > limit && (
        <Button
          variant="ghost"
          onClick={() => {
            setLimit(limit + page)
          }}
        >
          {t('transactions.showMore')}
        </Button>
      )}
      {editor.sheet}
    </Page>
  )
}
