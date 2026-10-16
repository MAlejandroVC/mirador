import { hasEnded, nextOccurrence, type Recurring, toCalendarDate } from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { ArrowsClockwiseIcon } from '../../components/ui/icons'
import { List } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { formatShortDate, useMoney } from '../../lib/format'
import { taxonomy } from '../categories/lookups'
import { EntrySheet } from '../transactions/entry-sheet'
import { useTransactionEditor } from '../transactions/use-transaction-editor'
import { useLedger } from '../wallets/use-ledger'
import { repeatLabel } from './labels'
import { RecurringRow } from './upcoming-row'

// TXN-09: every recurring transaction, pushed in from Transactions (DL-PAT-01): those
// still repeating, soonest first, with when each comes next; then those that ended.
// Each opens to be changed or stopped.
export function RecurringScreen() {
  const { t } = useTranslation()
  const { data: ledger } = useLedger()
  const editor = useTransactionEditor()
  const [adding, setAdding] = useState(false)
  const money = useMoney(ledger?.defaultCurrency ?? 'USD')
  const today = toCalendarDate(new Date())
  const back = useBack(t('nav.transactions'), { to: '/transactions' })
  if (!ledger) return <Page title={t('recurring.title')} back={back} />

  const wallets = new Map(ledger.wallets.map((wallet) => [wallet.id, wallet]))
  const lookups = taxonomy(ledger)
  const next = (recurring: Recurring) =>
    nextOccurrence(recurring, recurring.handled ?? today) ?? recurring.start
  const shown = ledger.recurring.filter((recurring) => wallets.has(recurring.walletId))
  const active = shown
    .filter((recurring) => !hasEnded(recurring, recurring.handled ?? today))
    .sort((a, b) => (next(a) < next(b) ? -1 : 1))
  const ended = shown.filter((recurring) => hasEnded(recurring, recurring.handled ?? today))
  const day = (date: string) => formatShortDate(date, today, money.locale)

  const row = (recurring: Recurring, detail: string) => (
    <RecurringRow
      key={recurring.id}
      recurring={recurring}
      detail={detail}
      wallets={wallets}
      taxonomy={lookups}
      defaultCurrency={ledger.defaultCurrency}
      onOpen={() => {
        editor.openSeries(recurring)
      }}
    />
  )

  return (
    <Page title={t('recurring.title')} back={back}>
      {shown.length === 0 ? (
        <EmptyState
          icon={ArrowsClockwiseIcon}
          title={t('recurring.empty.title')}
          action={
            <Button
              className="mt-1 px-6"
              onClick={() => {
                setAdding(true)
              }}
            >
              {t('recurring.empty.action')}
            </Button>
          }
        >
          {t('recurring.empty.body')}
        </EmptyState>
      ) : (
        <>
          {active.length > 0 && (
            <List label={t('recurring.active')}>
              {active.map((recurring) =>
                row(
                  recurring,
                  `${t('recurring.next', { date: day(next(recurring)) })} · ${repeatLabel(t, recurring.every)}`,
                ),
              )}
            </List>
          )}
          {ended.length > 0 && (
            <List label={t('recurring.ended')}>
              {ended.map((recurring) =>
                row(
                  recurring,
                  t('recurring.endedOn', { date: day(recurring.handled ?? recurring.start) }),
                ),
              )}
            </List>
          )}
        </>
      )}
      <EntrySheet
        open={adding}
        mode={{ kind: 'new', source: 'manual', repeat: { unit: 'month', count: 1 } }}
        onClose={() => {
          setAdding(false)
        }}
      />
      {editor.sheet}
    </Page>
  )
}
