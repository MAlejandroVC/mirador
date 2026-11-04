import {
  fewerPurchases,
  type GoalPlan,
  lastTimeAtMost,
  type LineBaseline,
  monthsPerFewerPurchase,
} from '@repo/core'
import type { BudgetWords } from './budget-words'

// BUD-32 to BUD-35: how a month's budget and Find money put a cut and its effect on the
// goals into words.

/** Months from one date's month to another's. */
export function monthsApart(from: string, to: string) {
  const index = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))
  return index(to) - index(from)
}

/**
 * BUD-34, BUD-35: a cut as a habit at the line's usual purchase ("About 1 fewer
 * purchase a month"), then the last month the person spent that little.
 */
export function cutNote(
  words: BudgetWords,
  usual: LineBaseline | undefined,
  before: number,
  after: number,
  months: number,
): string {
  const { t } = words
  if (!usual || after >= before) return ''
  const parts: string[] = []
  if (usual.averageTicket > 0) {
    const fewer = fewerPurchases(before - after, usual.averageTicket)
    // Something bought every few months, such as flights, skips one now and then; a
    // weekly habit just gets a little smaller.
    const every =
      usual.purchasesPerMonth < 1 ? monthsPerFewerPurchase(before - after, usual.averageTicket) : 0
    parts.push(
      fewer > 0
        ? t('budget.find.fewer', { count: fewer })
        : every >= 2 && every <= 12
          ? t('budget.find.fewerEvery', { count: every })
          : t('budget.find.fewerSmaller'),
    )
  }
  const last = lastTimeAtMost(usual, after)
  parts.push(
    !last
      ? t('budget.find.never', { count: months })
      : t('budget.find.last', { month: words.monthIn(last.period) }),
  )
  return parts.join(' ')
}

/** BUD-32: a goal's date as a month's budget leaves it: "Sep 2027 · on time". */
export function goalDate(words: BudgetWords, plan: GoalPlan): string {
  const { t } = words
  if (plan.funding === 'reached') return t('budget.goals.reached')
  if (plan.target === null)
    return plan.funded >= plan.need
      ? t('budget.find.monthly', { amount: words.text(plan.funded) })
      : t('budget.goals.perMonthOf', {
          funded: words.text(plan.funded),
          need: words.text(plan.need),
        })
  if (plan.projected === null) return t('budget.find.noDate')
  const date = words.monthYear(plan.projected)
  const by = plan.goal.by
  if (!by) return date
  if (plan.onTime) return t('budget.find.onTime', { date })
  return t('budget.find.late', { date, count: monthsApart(by, plan.projected) })
}

/** BUD-35: what the cuts do to a goal, against the budget as it is. */
export function goalMove(
  words: BudgetWords,
  before: GoalPlan | undefined,
  after: GoalPlan,
): string | null {
  const { t } = words
  if (after.target === null) {
    if (!before || after.funded <= before.funded) return null
    return after.funded >= after.need
      ? t('budget.find.fullyFunded', { amount: words.text(after.funded) })
      : t('budget.find.moreMonthly', { amount: words.text(after.funded - before.funded) })
  }
  if (after.projected === null) return null
  const date = words.monthYear(after.projected)
  const was = before?.projected ?? null
  if (was === null) return t('budget.find.reachedBy', { date })
  const sooner = monthsApart(after.projected, was)
  if (sooner <= 0) return null
  if (after.onTime && before && !before.onTime) return t('budget.find.backTo', { date })
  return t('budget.find.sooner', { date, count: sooner })
}
