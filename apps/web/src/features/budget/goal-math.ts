import {
  affordability,
  closeTheGap,
  contributedIn,
  type Goal,
  type GoalPlan,
  monthlyRate,
  payoff,
} from '@repo/core'
import type { Budget } from './use-budget'

// What the goal screens work out from the budget: this month's part (BUD-46), a debt's
// payoff (BUD-28) and what a purchase can cost (BUD-60 to BUD-66).

/** BUD-46: what went into a goal this month so far. */
export function contributedThisMonth(budget: Budget, goal: Goal) {
  return contributedIn(
    goal,
    budget.contributions,
    budget.balances,
    budget.month.period,
    budget.today,
  )
}

/** The goal's place in this month's funding, when it is active (BUD-23). */
export function planOf(budget: Budget, goalId: string): GoalPlan | undefined {
  return budget.funding.goals.find((plan) => plan.goal.id === goalId)
}

/** BUD-28: a debt's wallet, what is owed on it and its monthly interest rate. */
export function debtOf(budget: Budget, goal: Goal) {
  const wallet = budget.ledger.wallets.find((item) => item.id === goal.walletIds[0])
  if (!wallet) return null
  const owed = Math.max(0, -budget.balances.balance([wallet.id], budget.today))
  const rate = wallet.interest ? monthlyRate(wallet.interest) : 0
  return { wallet, owed, rate }
}

/**
 * BUD-28: paying the debt at its funded amount each month, and what one step more
 * (a quarter more each month) would save in months and interest.
 */
export function debtPlan(budget: Budget, goal: Goal) {
  const debt = debtOf(budget, goal)
  const plan = planOf(budget, goal.id)
  if (!debt || !plan || plan.funded <= 0) return null
  const now = payoff(debt.owed, plan.funded, debt.rate)
  const more = Math.round(plan.funded * 1.25)
  const faster = payoff(debt.owed, more, debt.rate)
  return { ...debt, payment: plan.funded, now, more, faster }
}

/**
 * BUD-61 to BUD-64: what a purchase can cost on its date. The down payment is the
 * chosen wallets' balance (contributions until then left out, as in the acceptance
 * example) minus the safety buffer and what other goals already hold in them; the
 * payment is the free left over, with the plan and with the deepest cuts the budget
 * would suggest (BUD-62).
 */
export function affordFor(budget: Budget, goal: Goal) {
  const purchase = goal.purchase
  if (!purchase) return null
  const savings = budget.balances.balance(goal.walletIds, budget.today)
  const buffer =
    purchase.bufferMonths === undefined
      ? purchase.buffer
      : purchase.bufferMonths * budget.essentials
  // Other goals that follow the same wallets hold part of that balance.
  const heldForGoals = budget.goals
    .filter(
      (other) =>
        other.id !== goal.id &&
        other.kind !== 'afford' &&
        other.done === undefined &&
        other.walletIds.some((id) => goal.walletIds.includes(id)),
    )
    .reduce((sum, other) => sum + Math.max(0, budget.progress.get(other.id) ?? 0), 0)
  // BUD-63: the rate is a yearly one, in hundredths of a percent.
  const rate = (purchase.rate ?? 0) / 10_000 / 12
  const payments = purchase.payments ?? 0
  const input = { savings, buffer, heldForGoals, monthlyRate: rate, payments }
  const free = budget.funding.free
  const cuts = closeTheGap(
    budget.month.lines,
    budget.usual.lines,
    budget.usual.total,
    budget.settings.maxCut,
  )
  return {
    savings,
    buffer,
    heldForGoals,
    financed: payments > 0,
    plan: affordability({ ...input, free }),
    withCuts: cuts.freed > 0 ? affordability({ ...input, free: free + cuts.freed }) : null,
    cuts: cuts.freed,
  }
}
