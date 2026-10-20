import { lineOf } from '@repo/core'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChoiceRow } from '../../components/ui/choice-row'
import { FieldNote } from '../../components/ui/field-row'
import { List } from '../../components/ui/list'
import { Sheet } from '../../components/ui/sheet'
import { useSaveRecords } from '../wallets/use-ledger'
import { useBudgetWords } from './budget-words'
import { currentPlan, planChange } from './records'
import type { Budget } from './use-budget'

// BUD-03: a month or a purchase that isn't how the person usually lives, such as a
// trip, left out of a line's usual month. It stays in Spending; only the plan's usual
// month stops counting it. Like a settings sheet, it saves when it closes.
export function LeaveOutSheet({
  open,
  budget,
  line,
  onClose,
}: {
  open: boolean
  budget: Budget
  line: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  // The form saves what changed on its way out, however the sheet is closed.
  const closeRef = useRef<(() => void) | null>(null)
  return (
    <Sheet
      open={open}
      title={t('budget.leaveOut.title')}
      doneLabel={t('nav.done')}
      onClose={() => {
        ;(closeRef.current ?? onClose)()
      }}
    >
      {open && <LeaveOutForm budget={budget} line={line} onClose={onClose} closeRef={closeRef} />}
    </Sheet>
  )
}

// How many of the line's largest purchases to offer.
const purchases = 6

function LeaveOutForm({
  budget,
  line,
  onClose,
  closeRef,
}: {
  budget: Budget
  line: string
  onClose: () => void
  closeRef: RefObject<(() => void) | null>
}) {
  const words = useBudgetWords(budget.context.currency, budget.today)
  const { t } = words
  const save = useSaveRecords()
  const plan = currentPlan(budget.ledger)
  const [months, setMonths] = useState(() =>
    plan.exclusions.linePeriods.filter((item) => item.line === line).map((item) => item.start),
  )
  const [left, setLeft] = useState(() => plan.exclusions.transactionIds)
  const periods = budget.usual.periods
  const first = periods[0]?.start ?? budget.month.period.start
  const spent = (start: string, end: string) =>
    budget.entries
      .filter((entry) => !entry.excluded && entry.date >= start && entry.date <= end)
      .filter((entry) => lineOf(entry, plan.tagLines) === line)
      .reduce((sum, entry) => sum + entry.spent, 0)
  // The largest purchases of its last months, by the transaction they belong to.
  const largest = budget.entries
    .filter(
      (entry) =>
        !entry.excluded &&
        entry.spent > 0 &&
        entry.date >= first &&
        entry.date < budget.month.period.start &&
        lineOf(entry, plan.tagLines) === line,
    )
    .sort((a, b) => b.spent - a.spent)
    .slice(0, purchases)
  const payees = budget.lookups.payees

  function close() {
    const linePeriods = [
      ...plan.exclusions.linePeriods.filter((item) => item.line !== line),
      ...months.map((start) => ({ line, start })),
    ]
    const changed =
      JSON.stringify(linePeriods) !== JSON.stringify(plan.exclusions.linePeriods) ||
      JSON.stringify(left) !== JSON.stringify(plan.exclusions.transactionIds)
    if (changed)
      save.mutate([
        planChange(budget.ledger, {
          exclusions: { ...plan.exclusions, linePeriods, transactionIds: left },
        }),
      ])
    onClose()
  }

  useEffect(() => {
    closeRef.current = close
    return () => {
      closeRef.current = null
    }
  })

  return (
    <>
      <List label={t('budget.leaveOut.months')} inset>
        {periods.map((period) => {
          const whole = plan.exclusions.periods.includes(period.start)
          return (
            <ChoiceRow
              key={period.start}
              title={words.monthTitle(period)}
              subtitle={
                whole
                  ? t('budget.leaveOut.wholeMonth')
                  : words.text(spent(period.start, period.end))
              }
              checked={whole || months.includes(period.start)}
              onToggle={() => {
                if (whole) return
                setMonths(
                  months.includes(period.start)
                    ? months.filter((start) => start !== period.start)
                    : [...months, period.start],
                )
              }}
            />
          )
        })}
      </List>
      {largest.length > 0 && (
        <List label={t('budget.leaveOut.purchases')} inset>
          {largest.map((entry) => (
            <ChoiceRow
              key={entry.id}
              title={
                (entry.payeeId === null ? undefined : payees.get(entry.payeeId)?.name) ??
                entry.note ??
                words.day(entry.date)
              }
              subtitle={`${words.text(entry.spent)} · ${words.day(entry.date)}`}
              checked={left.includes(entry.transactionId)}
              onToggle={() => {
                setLeft(
                  left.includes(entry.transactionId)
                    ? left.filter((id) => id !== entry.transactionId)
                    : [...left, entry.transactionId],
                )
              }}
            />
          ))}
        </List>
      )}
      <FieldNote>{t('budget.leaveOut.hint')}</FieldNote>
    </>
  )
}
