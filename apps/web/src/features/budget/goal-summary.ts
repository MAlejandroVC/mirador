import type { Goal, GoalPlan } from '@repo/core'
import type { BudgetWords } from './budget-words'

/** The value and line a goal's row shows. */
export function goalSummary(
  goal: Goal,
  plan: GoalPlan | undefined,
  progress: number,
  target: number | null,
  words: BudgetWords,
): { value?: string; note?: string } {
  const { t } = words
  const ofTarget =
    target === null
      ? undefined
      : t('budget.goals.of', {
          progress: words.text(Math.max(0, progress)),
          target: words.text(target),
        })
  if (goal.done !== undefined)
    return { value: t('budget.goals.done'), ...(ofTarget ? { note: ofTarget } : {}) }
  if (goal.kind === 'afford' && goal.purchase)
    return { value: words.day(goal.purchase.date), note: t('budget.goals.afford') }
  if (goal.paused)
    return { value: t('budget.goals.paused'), ...(ofTarget ? { note: ofTarget } : {}) }
  if (!plan) return ofTarget ? { note: ofTarget } : {}
  if (plan.funding === 'reached')
    return { value: t('budget.goals.reached'), ...(ofTarget ? { note: ofTarget } : {}) }
  const value =
    target === null
      ? t('budget.goals.perMonthOf', {
          funded: words.text(plan.funded),
          need: words.text(plan.need),
        })
      : plan.projected
        ? words.monthYear(plan.projected)
        : undefined
  const note =
    plan.funding === 'partly'
      ? t('budget.goals.partly', { amount: words.text(plan.need - plan.funded) })
      : plan.funding === 'unfunded'
        ? t('budget.goals.unfunded', { amount: words.text(plan.need) })
        : ofTarget
  return { ...(value ? { value } : {}), ...(note ? { note } : {}) }
}
