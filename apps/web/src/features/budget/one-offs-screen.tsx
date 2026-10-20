import type { AnalysisEntry, OneOff } from '@repo/core'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { ChoiceRow } from '../../components/ui/choice-row'
import { EmptyState } from '../../components/ui/empty-state'
import { FieldNote } from '../../components/ui/field-row'
import { IconTile } from '../../components/ui/icon-tile'
import { ChartLineUpIcon } from '../../components/ui/icons'
import { List } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { useSaveRecords } from '../wallets/use-ledger'
import { type BudgetWords, useBudgetWords } from './budget-words'
import { lineName } from './lines'
import { currentPlan, planChange } from './records'
import { type Budget, useBudget } from './use-budget'

// BUD-02, BUD-03, BUD-76: what the starting amounts leave out. A one-off, such as a
// flight or one big dinner, still counts in its own month, but an average that counted
// it would budget for it every month. Each one can be counted after all; purchases the
// person left out by hand from a category's screen show here too.
export function OneOffsScreen() {
  const { t } = useTranslation()
  const back = useBack()
  const budget = useBudget()
  return (
    <Page
      title={t('budget.oneOffs.title')}
      back={back}
      card={{
        icon: <IconTile icon={ChartLineUpIcon} size="large" />,
        description: t('budget.oneOffs.description'),
      }}
    >
      {budget && <OneOffs budget={budget} />}
    </Page>
  )
}

function OneOffs({ budget }: { budget: Budget }) {
  const words = useBudgetWords(budget.context.currency, budget.today)
  const { t } = words
  const save = useSaveRecords()
  const plan = currentPlan(budget.ledger)
  const oneOffs = [...budget.usual.oneOffs].sort(
    (a, b) => b.date.localeCompare(a.date) || b.amount - a.amount,
  )
  // Purchases left out by hand, once each, however many installments they have.
  const byHand = new Map<string, AnalysisEntry>()
  for (const entry of budget.entries)
    if (plan.exclusions.transactionIds.includes(entry.transactionId) && entry.spent > 0) {
      const seen = byHand.get(entry.transactionId)
      byHand.set(entry.transactionId, seen ? { ...seen, spent: seen.spent + entry.spent } : entry)
    }
  const handList = [...byHand.values()].sort((a, b) => b.date.localeCompare(a.date))

  const count = (oneOff: OneOff) => {
    const counted = new Set(plan.exclusions.counted ?? [])
    if (oneOff.counted) counted.delete(oneOff.transactionId)
    else counted.add(oneOff.transactionId)
    save.mutate([
      planChange(budget.ledger, {
        exclusions: { ...plan.exclusions, counted: [...counted].sort() },
      }),
    ])
  }
  const countByHand = (transactionId: string) => {
    save.mutate([
      planChange(budget.ledger, {
        exclusions: {
          ...plan.exclusions,
          transactionIds: plan.exclusions.transactionIds.filter((id) => id !== transactionId),
        },
      }),
    ])
  }

  if (oneOffs.length === 0 && handList.length === 0)
    return (
      // DL-CMP-14
      <EmptyState icon={ChartLineUpIcon} title={t('budget.oneOffs.none')}>
        {t('budget.oneOffs.noneBody', { count: budget.settings.lookback })}
      </EmptyState>
    )

  return (
    <>
      {oneOffs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <List label={t('budget.oneOffs.found', { count: budget.settings.lookback })}>
            {oneOffs.map((oneOff) => (
              <ChoiceRow
                key={oneOff.transactionId}
                role="switch"
                title={t('budget.oneOffs.row', {
                  name: lineName(budget, oneOff.line),
                  amount: words.text(oneOff.amount),
                })}
                subtitle={why(budget, words, oneOff)}
                checked={!oneOff.counted}
                onToggle={() => {
                  count(oneOff)
                }}
              />
            ))}
          </List>
          <FieldNote>{t('budget.oneOffs.hint', { count: budget.settings.lookback })}</FieldNote>
        </div>
      )}
      {handList.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <List label={t('budget.oneOffs.byHand')}>
            {handList.map((entry) => (
              <ChoiceRow
                key={entry.transactionId}
                role="switch"
                title={t('budget.oneOffs.row', {
                  name: entry.categoryId ? lineName(budget, entry.categoryId) : '',
                  amount: words.text(entry.spent),
                })}
                subtitle={words.day(entry.date)}
                checked
                onToggle={() => {
                  countByHand(entry.transactionId)
                }}
              />
            ))}
          </List>
          <FieldNote>{t('budget.oneOffs.byHandHint')}</FieldNote>
        </div>
      )}
    </>
  )
}

/** "Sep 14 · over 3 times your usual $310.00", or the only purchase there. */
function why(budget: Budget, words: BudgetWords, oneOff: OneOff) {
  const { t } = words
  const day = words.day(oneOff.date)
  return oneOff.reason === 'only'
    ? t('budget.oneOffs.only', { date: day, count: budget.settings.lookback })
    : t('budget.oneOffs.large', { date: day, amount: words.text(oneOff.usual) })
}
