import type { BudgetSnapshotRecord } from '@repo/api'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { EmptyState } from '../../components/ui/empty-state'
import { IconTile } from '../../components/ui/icon-tile'
import { CalendarCheckIcon } from '../../components/ui/icons'
import { List, ListRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { ShowMoreRow } from '../../components/ui/show-more-row'
import { Card } from '../analysis/parts'
import { CategoryTile } from '../categories/category-tile'
import { type BudgetWords, useBudgetWords } from './budget-words'
import { lineLook, lineName } from './lines'
import { GoalTile, Over } from './parts'
import { type Budget, useBudget } from './use-budget'

/** How many categories show before "See all" (DL-CMP-15). */
const shownRows = 5

// BUD-56: a closed month as it was when it closed, read only: its left over and income,
// planned against lived, each category's target against what it spent, and the goals.
export function MonthScreen({ start }: { start: string }) {
  const { t } = useTranslation()
  const back = useBack()
  const budget = useBudget()
  const snapshot = budget?.ledger.snapshots.find((item) => item.start === start)
  if (!budget) return <Page title="" back={back} />
  if (!snapshot)
    return (
      <Page title={t('budget.month.missing')} back={back}>
        {/* DL-CMP-14 */}
        <EmptyState icon={CalendarCheckIcon} title={t('budget.month.missing')}>
          {t('budget.month.missingBody')}
        </EmptyState>
      </Page>
    )
  return <Month budget={budget} snapshot={snapshot} />
}

function Month({ budget, snapshot }: { budget: Budget; snapshot: BudgetSnapshotRecord }) {
  const words = useBudgetWords(budget.context.currency, budget.today)
  const { t } = words
  const back = useBack()
  const [all, setAll] = useState(false)
  // The ones that went over first, then by how far each landed from its target.
  const lines = [...snapshot.lines]
    .filter((line) => line.target > 0 || line.spent > 0)
    .sort(
      (a, b) =>
        Math.max(0, b.spent - b.target) - Math.max(0, a.spent - a.target) ||
        Math.abs(b.target - b.spent) - Math.abs(a.target - a.spent),
    )
  const carry = snapshot.carry.filter((item) => item.amount !== 0)

  return (
    <Page
      title={words.period(snapshot, 'month')}
      back={back}
      card={{
        icon: <IconTile icon={CalendarCheckIcon} size="large" />,
        description: t('budget.month.description', {
          date: words.day(snapshot.closedAt.slice(0, 10)),
        }),
      }}
    >
      <Card className="flex flex-col gap-3">
        <Figures
          label={t('budget.month.leftOver')}
          planned={snapshot.leftOver.planned}
          actual={snapshot.leftOver.actual}
          words={words}
        />
        <Figures
          label={t('budget.month.income')}
          planned={snapshot.income.planned}
          actual={snapshot.income.actual}
          words={words}
        />
      </Card>

      {lines.length > 0 && (
        <List label={t('budget.month.categories')}>
          {(all ? lines : lines.slice(0, shownRows)).map((line) => {
            const look = lineLook(budget, line.line)
            const left = line.target - line.spent
            return (
              <ListRow
                key={line.line}
                leading={
                  look.category ? (
                    <CategoryTile category={look.category} group={look.group} />
                  ) : null
                }
                title={lineName(budget, line.line)}
                subtitle={t('budget.review.of', {
                  spent: words.text(line.spent),
                  target: words.text(line.target),
                })}
                trailing={
                  <span className="shrink-0 text-[0.9375rem] tabular-nums">
                    {left < 0 ? (
                      // DL-COL-05: over shows only in the words, in `warning`.
                      <Over>{t('budget.review.over', { amount: words.text(-left) })}</Over>
                    ) : (
                      <span className="text-text-muted">
                        {t('budget.review.left', { amount: words.text(left) })}
                      </span>
                    )}
                  </span>
                }
              />
            )
          })}
          {lines.length > shownRows && (
            <ShowMoreRow
              open={all}
              more={t('budget.review.allCategories', { count: lines.length })}
              less={t('budget.review.fewer')}
              separator
              onToggle={() => {
                setAll(!all)
              }}
            />
          )}
        </List>
      )}

      {snapshot.goals.length > 0 && (
        <List label={t('budget.month.goals')}>
          {snapshot.goals.map((goal) => (
            <ListRow
              key={goal.goalId}
              leading={
                <GoalTile
                  kind={budget.goals.find((item) => item.id === goal.goalId)?.kind ?? 'save'}
                />
              }
              title={goal.name}
              subtitle={[
                goal.target === undefined
                  ? t('budget.month.saved', { amount: words.text(goal.progress) })
                  : t('budget.month.progress', {
                      progress: words.text(goal.progress),
                      target: words.text(goal.target),
                    }),
                goal.projected &&
                  t('budget.month.projected', { date: words.monthYear(goal.projected) }),
              ]
                .filter(Boolean)
                .join(' · ')}
              trailing={
                goal.contributed > 0 ? (
                  <span className="shrink-0 text-[0.9375rem] text-text-muted tabular-nums">
                    {t('budget.month.added', { amount: words.text(goal.contributed) })}
                  </span>
                ) : null
              }
            />
          ))}
        </List>
      )}

      {/* BUD-52: what this month carried into the next. */}
      {carry.length > 0 && (
        <List label={t('budget.month.carried')}>
          {carry.map((item) => (
            <ListRow
              key={item.line}
              title={lineName(budget, item.line)}
              trailing={
                <span className="shrink-0 text-[0.9375rem] tabular-nums">
                  {words.amount(item.amount, 'muted')}
                </span>
              }
            />
          ))}
        </List>
      )}

      <p className="mb-6 px-4 text-[0.8125rem] text-text-muted">
        {snapshot.targets === 'kept' ? t('budget.month.kept') : t('budget.month.updated')}
      </p>
    </Page>
  )
}

/** One figure, planned against lived. */
function Figures({
  label,
  planned,
  actual,
  words,
}: {
  label: string
  planned: number
  actual: number
  words: BudgetWords
}) {
  const { t } = words
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xs tracking-[0.04em] text-text-muted uppercase">{label}</h2>
      <dl className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[0.8125rem] text-text-muted">{t('budget.month.planned')}</dt>
          <dd>{words.amount(planned)}</dd>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <dt className="text-[0.8125rem] text-text-muted">{t('budget.month.actual')}</dt>
          <dd>{words.amount(actual)}</dd>
        </div>
      </dl>
    </div>
  )
}
