import {
  fewerPurchases,
  monthsPerFewerPurchase,
  type GoalPlan,
  lastTimeAtMost,
  type Period,
  parseLineKey,
  type Scenario,
} from '@repo/core'
import type { BudgetWords } from './budget-words'
import { targetBefore } from './scenario-math'
import type { Budget } from './use-budget'

// BUD-32 to BUD-35: how the what-if screens put a change and its effect into words.

/** Months from one date's month to another's. */
function monthsApart(from: string, to: string) {
  const index = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))
  return index(to) - index(from)
}

/** "June", or "Jun 2025" for a month of another year. */
export function monthOf(words: BudgetWords, period: Period) {
  return period.start.slice(0, 4) === words.today.slice(0, 4)
    ? words.monthName(period)
    : words.monthYear(period.start)
}

/**
 * BUD-30, BUD-34, BUD-35: a line change in a sentence or two: how far and to what, the
 * last month the person spent that little, and the habit it means at the usual
 * purchase ("about 1 fewer purchase a month").
 */
export function changeNote(
  budget: Budget,
  words: BudgetWords,
  scenario: Scenario,
  key: string,
  after: number,
): string {
  const { t } = words
  const before = targetBefore(budget, key)
  const line = budget.month.lines.find((item) => item.key === key)
  const parts: string[] = []
  if (before === 0 && after > 0) parts.push(t('budget.whatIf.newExpense'))
  else if (before > 0 && after !== before)
    parts.push(
      t(after < before ? 'budget.whatIf.cutTo' : 'budget.whatIf.raiseTo', {
        percent: words.share(Math.abs(after - before) / before),
        amount: words.text(after),
      }),
    )
  const usual = line?.usual
  if (after < before && usual) {
    const last = lastTimeAtMost(usual, after)
    parts.push(
      !last
        ? t('budget.whatIf.neverSpent', { count: budget.usual.counted.length })
        : last.spent <= 0
          ? t('budget.whatIf.lastNothing', { month: monthOf(words, last.period) })
          : t('budget.whatIf.lastSpent', {
              amount: words.text(last.spent),
              month: monthOf(words, last.period),
            }),
    )
    if (usual.averageTicket > 0) {
      const fewer = fewerPurchases(before - after, usual.averageTicket)
      // Something bought every few months, such as flights, skips one now and then; a
      // monthly bill or a weekly habit just gets a little smaller.
      const every =
        usual.purchasesPerMonth < 1
          ? monthsPerFewerPurchase(before - after, usual.averageTicket)
          : 0
      parts.push(
        fewer > 0
          ? t('budget.whatIf.fewer', { count: fewer })
          : every >= 2 && every <= 12
            ? t('budget.whatIf.fewerEvery', { count: every })
            : t('budget.whatIf.fewerSmaller'),
      )
    }
  }
  const { categoryId } = parseLineKey(key)
  const kind = scenario.flexibility.find((item) => item.categoryId === categoryId)
  if (kind)
    parts.push(
      t('budget.whatIf.countsAs', { type: t(`categories.flexibility.${kind.flexibility}`) }),
    )
  if (scenario.unlocked.includes(key)) parts.push(t('budget.whatIf.unlocked'))
  return parts.join(' ')
}

/** BUD-32: what a what-if does to one goal, against the plan as it is. */
export function goalEffect(
  words: BudgetWords,
  before: GoalPlan | undefined,
  after: GoalPlan,
): string {
  const { t } = words
  if (after.funding === 'reached') return t('budget.whatIf.goal.reached')
  if (after.target === null) {
    // A repeating investment has no date, so what it gets each month is the news.
    if (after.funded >= after.need)
      return before && before.funded >= before.need
        ? t('budget.whatIf.goal.stillMonthly', { amount: words.text(after.funded) })
        : t('budget.whatIf.goal.funded', { amount: words.text(after.funded) })
    return after.funded > 0
      ? t('budget.whatIf.goal.partly', {
          amount: words.text(after.funded),
          need: words.text(after.need),
        })
      : t('budget.whatIf.goal.unfunded')
  }
  if (after.projected === null) return t('budget.whatIf.goal.unfunded')
  const date = words.monthYear(after.projected)
  const was = before?.projected ?? null
  if (was === null) return t('budget.whatIf.goal.reachedBy', { date })
  const apart = monthsApart(was, after.projected)
  if (apart === 0) return t('budget.whatIf.goal.same', { date })
  return apart < 0
    ? t('budget.whatIf.goal.sooner', { date, count: -apart })
    : t('budget.whatIf.goal.later', { date, count: apart })
}

/** BUD-38: a goal's date in one column of a comparison. */
export function goalDate(words: BudgetWords, plan: GoalPlan | undefined): string {
  const { t } = words
  if (!plan) return t('budget.compare.never')
  if (plan.funding === 'reached') return t('budget.compare.reached')
  if (plan.target === null)
    return plan.funded > 0
      ? t('budget.compare.monthly', { amount: words.text(plan.funded) })
      : t('budget.compare.never')
  return plan.projected === null ? t('budget.compare.never') : words.monthYear(plan.projected)
}
