import { inPeriod, type PeriodScope, shiftPeriod } from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { List } from '../../components/ui/list'
import { Sheet } from '../../components/ui/sheet'
import { setAnalysisState } from './analysis-state'
import { PeriodControl } from './parts'
import type { Analysis } from './use-analysis'
import { useWords } from './use-words'

const scopes: readonly PeriodScope[] = ['week', 'month', 'quarter', 'year']

/**
 * ANA-02: the period every analysis screen shows, with the ones before; the name opens
 * the choice of a week, month, quarter or year. It is shared by the Budget screens, so
 * a question opened from Spending shows the same period.
 */
export function PeriodHeader({ analysis, subtitle }: { analysis: Analysis; subtitle?: string }) {
  const { t } = useTranslation()
  const words = useWords(analysis.context.currency, analysis.today)
  const [open, setOpen] = useState(false)
  const { state, view, today } = analysis
  const close = () => {
    setOpen(false)
  }
  return (
    <>
      <PeriodControl
        name={words.period(view.period, view.scope)}
        {...(subtitle ? { subtitle } : {})}
        previousLabel={t('transactions.period.previous')}
        nextLabel={t('transactions.period.next')}
        onPrevious={() => {
          setAnalysisState({
            anchor: shiftPeriod(state.anchor, state.scope, -1, 0, view.monthStart).start,
          })
        }}
        onNext={() => {
          setAnalysisState({
            anchor: shiftPeriod(state.anchor, state.scope, 1, 0, view.monthStart).start,
          })
        }}
        // Analysis looks back: the period after this one hasn't happened yet.
        nextDisabled={view.period.end >= today}
        onPick={() => {
          setOpen(true)
        }}
      />
      <Sheet
        open={open}
        title={t('transactions.period.title')}
        doneLabel={t('nav.done')}
        onClose={close}
      >
        <List inset>
          {scopes.map((option) => (
            <ChoiceRow
              key={option}
              role="radio"
              title={t(`transactions.period.scopes.${option}`)}
              checked={state.scope === option}
              onToggle={() => {
                setAnalysisState({ scope: option })
                close()
              }}
            />
          ))}
        </List>
        {!inPeriod(today, view.period) && (
          <Button
            variant="secondary"
            onClick={() => {
              setAnalysisState({ anchor: today })
              close()
            }}
          >
            {t('transactions.period.current')}
          </Button>
        )}
      </Sheet>
    </>
  )
}
