import { useState } from 'react'
import { ChoiceRow } from '../../components/ui/choice-row'
import { List } from '../../components/ui/list'
import { Sheet } from '../../components/ui/sheet'
import { PeriodControl } from '../analysis/parts'
import type { BudgetWords } from './budget-words'
import { barMonths, monthState } from './month-view'
import { type Budget, monthOf, periodOf } from './use-budget'

// BUD-57, BUD-70, BUD-74: one page for every month. The month bar moves from the first
// month with a budget to 12 months ahead; under the month's name, where its budget
// stands.

export function MonthBar({
  budget,
  start,
  words,
  onChange,
}: {
  budget: Budget
  start: string
  words: BudgetWords
  onChange: (start: string) => void
}) {
  const { t } = words
  const [picking, setPicking] = useState(false)
  const months = barMonths(budget)
  const index = months.findIndex((period) => period.start === start)
  const period = months[index] ?? periodOf(budget, start)
  const step = (by: number) => {
    const next = months[index + by]
    if (next) onChange(next.start)
  }
  return (
    <>
      <PeriodControl
        name={words.monthBar(period)}
        subtitle={monthState(budget, words, monthOf(budget, start))}
        previousLabel={t('budget.bar.previous')}
        nextLabel={t('budget.bar.next')}
        onPrevious={() => {
          step(-1)
        }}
        onNext={() => {
          step(1)
        }}
        onPick={() => {
          setPicking(true)
        }}
        previousDisabled={index <= 0}
        nextDisabled={index === -1 || index >= months.length - 1}
      />
      <Sheet
        open={picking}
        title={t('budget.bar.pick')}
        doneLabel={t('nav.done')}
        onClose={() => {
          setPicking(false)
        }}
      >
        <List inset>
          {months.map((item) => {
            const state = monthState(budget, words, monthOf(budget, item.start))
            return (
              <ChoiceRow
                key={item.start}
                role="radio"
                title={words.monthBar(item)}
                subtitle={
                  item.start === budget.view.period.start
                    ? t('budget.bar.thisMonth', { state })
                    : state
                }
                checked={item.start === start}
                onToggle={() => {
                  onChange(item.start)
                  setPicking(false)
                }}
              />
            )
          })}
        </List>
      </Sheet>
    </>
  )
}
