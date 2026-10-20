import type { GoalPlan } from '@repo/core'
import type { ReactNode } from 'react'
import { useBack } from '../../components/shell/back'
import { IconTile } from '../../components/ui/icon-tile'
import { ColumnsIcon } from '../../components/ui/icons'
import { Page } from '../../components/ui/page'
import { useMoney } from '../../lib/format'
import { Card } from '../analysis/parts'
import { type BudgetWords, useBudgetWords } from './budget-words'
import { scenarioOf, type Tried, tryScenario } from './scenario-math'
import { type Budget, useBudget } from './use-budget'
import { goalDate } from './what-if-words'

// BUD-38: two or three saved what-ifs side by side on left over, total cut and each
// goal's date, with the plan as it is now beside each label. One column per what-if
// keeps three of them readable at 375 px.

export function CompareScreen({ ids }: { ids: readonly string[] }) {
  const budget = useBudget()
  const back = useBack()
  if (!budget) return <Page title="" back={back} />
  return <ComparePage budget={budget} ids={ids} back={back} />
}

function ComparePage({
  budget,
  ids,
  back,
}: {
  budget: Budget
  ids: readonly string[]
  back: ReturnType<typeof useBack>
}) {
  const words = useBudgetWords(budget.context.currency, budget.today)
  const { t } = words
  const money = useMoney(budget.context.currency)
  const columns = ids
    .map((id) => budget.ledger.scenarios.find((record) => record.id === id))
    .filter((record) => record !== undefined)
    .slice(0, 3)
    .map((record) => ({ record, tried: tryScenario(budget, scenarioOf(record)) }))
  const goals = budget.funding.goals.map((plan) => plan.goal)

  const versus = (tried: Tried) => {
    const difference = tried.leftOver - budget.month.leftOver
    return difference === 0
      ? t('budget.compare.same')
      : t('budget.compare.versus', {
          amount: money.text({ minor: difference, currency: budget.context.currency }, 'always'),
        })
  }

  return (
    <Page
      title={t('budget.compare.title')}
      back={back}
      card={{
        icon: <IconTile icon={ColumnsIcon} size="large" />,
        description: t('budget.compare.description'),
      }}
    >
      {columns.length < 2 ? (
        <Card>
          <p className="text-center text-[0.9375rem] text-text-muted">
            {t('budget.compare.missing')}
          </p>
        </Card>
      ) : (
        <section className="overflow-hidden rounded-2xl bg-surface">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr>
                {columns.map(({ record }) => (
                  <th
                    key={record.id}
                    scope="col"
                    className="px-2 pt-3.5 pb-2 align-bottom text-[0.9375rem] font-semibold break-words text-text first:pl-4 last:pr-4"
                  >
                    {record.name}
                  </th>
                ))}
              </tr>
            </thead>
            <Metric
              columns={columns.length}
              label={t('budget.compare.leftOver')}
              now={t('budget.compare.now', { value: words.text(budget.month.leftOver) })}
            >
              {columns.map(({ record, tried }) => (
                <Cell key={record.id}>
                  {words.amount(tried.leftOver)}
                  <span className="block text-[0.75rem] text-text-muted">{versus(tried)}</span>
                </Cell>
              ))}
            </Metric>
            <Metric columns={columns.length} label={t('budget.compare.cut')}>
              {columns.map(({ record, tried }) => (
                <Cell key={record.id}>{words.amount(tried.cut)}</Cell>
              ))}
            </Metric>
            {goals.length > 0 && (
              <tbody>
                <tr>
                  <th
                    colSpan={columns.length}
                    scope="colgroup"
                    className="border-t-[0.5px] border-separator px-4 pt-3 text-xs font-normal tracking-[0.04em] text-text-muted uppercase"
                  >
                    {t('budget.compare.goalsLabel')}
                  </th>
                </tr>
              </tbody>
            )}
            {goals.map((goal) => (
              <Metric
                key={goal.id}
                columns={columns.length}
                label={goal.name}
                now={nowFor(
                  words,
                  budget.funding.goals.find((plan) => plan.goal.id === goal.id),
                )}
                item
              >
                {columns.map(({ record, tried }) => (
                  <Cell key={record.id}>
                    {goalDate(
                      words,
                      tried.funding.goals.find((plan) => plan.goal.id === goal.id),
                    )}
                  </Cell>
                ))}
              </Metric>
            ))}
          </table>
        </section>
      )}
    </Page>
  )
}

/** "now Oct 2027", or "not funded now" for a goal the plan gives nothing. */
function nowFor(words: BudgetWords, plan: GoalPlan | undefined) {
  const { t } = words
  const funded = plan && (plan.funding === 'reached' || plan.funded > 0)
  return funded
    ? t('budget.compare.now', { value: goalDate(words, plan) })
    : t('budget.compare.nowNever')
}

/**
 * One measure across the columns: its label across the table, with the plan as it is
 * now at the right, then each what-if's value under its name.
 */
function Metric({
  columns,
  label,
  now,
  item,
  children,
}: {
  columns: number
  label: string
  now?: string
  /** A goal under "Goal dates": its name in sentence case, with no rule above. */
  item?: boolean
  children: ReactNode
}) {
  return (
    <tbody>
      <tr>
        <th
          colSpan={columns}
          scope="colgroup"
          className={`px-4 pb-1 font-normal text-text-muted ${
            item ? 'pt-2 text-[0.8125rem]' : 'border-t-[0.5px] border-separator pt-3 text-xs'
          }`}
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className={item ? '' : 'tracking-[0.04em] uppercase'}>{label}</span>
            {now && <span className="text-xs tabular-nums">{now}</span>}
          </span>
        </th>
      </tr>
      <tr>{children}</tr>
    </tbody>
  )
}

function Cell({ children }: { children: ReactNode }) {
  return (
    <td className="px-2 pb-3 align-top text-[0.9375rem] break-words text-text tabular-nums first:pl-4 last:pr-4">
      {children}
    </td>
  )
}
