import { goalDates } from '@repo/core'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { EmptyState } from '../../components/ui/empty-state'
import { IconTile } from '../../components/ui/icon-tile'
import { ClockCounterClockwiseIcon } from '../../components/ui/icons'
import { List, ListLinkRow, ListRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { useBudgetWords } from './budget-words'
import { GoalTile } from './parts'
import { type Budget, useBudget } from './use-budget'

// BUD-57: the months closed so far, newest first, each with the left over it planned
// and the one it lived, and how each goal's date moved from one close to the next.
export function HistoryScreen() {
  const { t } = useTranslation()
  const back = useBack()
  const budget = useBudget()
  return (
    <Page
      title={t('budget.history.title')}
      back={back}
      card={{
        icon: <IconTile icon={ClockCounterClockwiseIcon} size="large" />,
        description: t('budget.history.none'),
      }}
    >
      {budget && <History budget={budget} />}
    </Page>
  )
}

function History({ budget }: { budget: Budget }) {
  const words = useBudgetWords(budget.context.currency, budget.today)
  const { t } = words
  const snapshots = [...budget.ledger.snapshots].sort((a, b) => b.start.localeCompare(a.start))
  if (snapshots.length === 0)
    return (
      // DL-CMP-14
      <EmptyState icon={ClockCounterClockwiseIcon} title={t('budget.history.empty')}>
        {t('budget.history.emptyBody')}
      </EmptyState>
    )
  const dates = goalDates(snapshots).filter((goal) => goal.dates.some((date) => date.projected))
  return (
    <>
      <List label={t('budget.history.months')}>
        {snapshots.map((snapshot) => (
          <ListLinkRow
            key={snapshot.start}
            to="/budget/history/$start"
            params={{ start: snapshot.start }}
            title={words.period(snapshot, 'month')}
            subtitle={t('budget.history.planned', {
              amount: words.text(snapshot.leftOver.planned),
            })}
            trailing={
              <span className="shrink-0 text-[0.9375rem] tabular-nums">
                {words.amount(snapshot.leftOver.actual)}
              </span>
            }
          />
        ))}
      </List>
      {dates.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <List label={t('budget.history.goalDates')}>
            {dates.map((goal) => (
              <ListRow
                key={goal.goalId}
                leading={
                  <GoalTile
                    kind={budget.goals.find((item) => item.id === goal.goalId)?.kind ?? 'save'}
                  />
                }
                title={goal.name}
                subtitle={goal.dates
                  .map((date) =>
                    date.projected ? words.monthYear(date.projected) : t('budget.history.never'),
                  )
                  .join(' → ')}
              />
            ))}
          </List>
          <p className="px-4 text-[0.8125rem] text-text-muted">
            {t('budget.history.goalDatesHint')}
          </p>
        </div>
      )}
    </>
  )
}
