import { daysBetween, type Period, shiftPeriod } from './dates.ts'
import { convert, type ExchangeRate, rateInUse } from './exchange.ts'
import { balanceTransactions } from './installments.ts'
import type { Transaction } from './transactions.ts'
import type { Wallet } from './wallets.ts'
import { walletBalances } from './wallets.ts'

// Epic 6, goals: what the money left over each month is for. Pure functions; the
// caller passes "today", the budget month and the wallets' balances.

/** BUD-20: the kinds of goal. */
export type GoalKind = 'save' | 'debt' | 'invest' | 'emergency' | 'afford'

/** BUD-60, BUD-63: what the person may spend on a purchase, and how it would be paid. */
export interface Purchase {
  /** The purchase date. */
  date: string
  /** BUD-60: kept untouched, as an amount or as months of Commitments and Needs. */
  buffer: number
  bufferMonths?: number
  /** BUD-63: financing, in hundredths of a percent a year, over a number of months. */
  rate?: number
  payments?: number
}

/** BUD-20: a goal as the plan uses it. */
export interface Goal {
  id: string
  name: string
  kind: GoalKind
  /** What it needs in all; an investment that only repeats has none. */
  target?: number
  /** BUD-21: the date to reach it by. */
  by?: string
  /** BUD-22: the amount put in each month, in place of a date. */
  perMonth?: number
  /** What was already saved when the goal started. */
  saved: number
  /** BUD-25: the wallets whose growth is its progress. */
  walletIds: readonly string[]
  /** The day it started, which wallet growth is counted from. */
  start: string
  /** BUD-24: its place in the list; lower is funded first. */
  order: number
  paused?: boolean
  /** The day it was marked done. */
  done?: string
  /** BUD-27: an emergency fund's target as months of Commitments and Needs. */
  months?: number
  purchase?: Purchase
}

/** BUD-26: money the person added to a goal by hand. */
export interface Contribution {
  id: string
  goalId: string
  amount: number
  date: string
}

/** What measuring progress needs to know about wallets. */
export interface GoalBalances {
  /** The wallets' balance at the end of `date`, in the default currency. */
  balance: (walletIds: readonly string[], date: string) => number
}

/**
 * BUD-25: the wallets' balances on any date, in the default currency at the rate in use
 * that day (SYS-04); a wallet in a currency with no rate counts as nothing.
 */
export function walletGoalBalances(
  wallets: readonly Pick<Wallet, 'id' | 'currency' | 'features'>[],
  transactions: readonly Transaction[],
  currency: string,
  rates: readonly ExchangeRate[],
): GoalBalances {
  const credit = new Set(
    wallets.filter((wallet) => wallet.features.includes('creditLimit')).map((wallet) => wallet.id),
  )
  const cache = new Map<string, Map<string, number>>()
  const on = (date: string) => {
    let balances = cache.get(date)
    if (!balances) {
      const upTo = transactions.filter((transaction) => transaction.date <= date)
      balances = walletBalances(
        wallets as readonly Wallet[],
        balanceTransactions(upTo, credit, date),
      )
      cache.set(date, balances)
    }
    return balances
  }
  return {
    balance: (walletIds, date) => {
      let total = 0
      for (const wallet of wallets) {
        if (!walletIds.includes(wallet.id)) continue
        const balance = on(date).get(wallet.id) ?? 0
        if (wallet.currency === currency) total += balance
        else {
          const inUse = rateInUse(wallet.currency, currency, rates, date)
          if (inUse) total += convert(balance, wallet.currency, currency, inUse)
        }
      }
      return total
    },
  }
}

/** BUD-25, BUD-26: how far a goal has come. */
export function goalProgress(
  goal: Goal,
  contributions: readonly Contribution[],
  balances: GoalBalances,
  today: string,
): number {
  if (goal.kind === 'debt') {
    // BUD-28: a debt's progress is how much less is owed than when it started.
    const owedThen = Math.max(0, -balances.balance(goal.walletIds, dayBefore(goal.start)))
    const owedNow = Math.max(0, -balances.balance(goal.walletIds, today))
    return goal.saved + Math.max(0, owedThen - owedNow)
  }
  if (goal.walletIds.length > 0)
    return (
      goal.saved +
      balances.balance(goal.walletIds, today) -
      balances.balance(goal.walletIds, dayBefore(goal.start))
    )
  return (
    goal.saved +
    contributions
      .filter((item) => item.goalId === goal.id && item.date <= today)
      .reduce((sum, item) => sum + item.amount, 0)
  )
}

/** BUD-46: what went into a goal during `period`, up to today. */
export function contributedIn(
  goal: Goal,
  contributions: readonly Contribution[],
  balances: GoalBalances,
  period: Period,
  today: string,
): number {
  const end = today < period.end ? today : period.end
  const from = goal.start > period.start ? goal.start : period.start
  if (end < from) return 0
  if (goal.kind === 'debt')
    return Math.max(
      0,
      -balances.balance(goal.walletIds, dayBefore(from)) + balances.balance(goal.walletIds, end),
    )
  if (goal.walletIds.length > 0)
    return balances.balance(goal.walletIds, end) - balances.balance(goal.walletIds, dayBefore(from))
  return contributions
    .filter((item) => item.goalId === goal.id && item.date >= from && item.date <= end)
    .reduce((sum, item) => sum + item.amount, 0)
}

function dayBefore(date: string): string {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10)
}

/** The months from the one holding `from` to the one holding `to`, both counted. */
export function monthsBetween(from: string, to: string, monthStart: number): number {
  if (to < from) return 0
  let count = 1
  let period = shiftPeriod(from, 'month', 0, 0, monthStart)
  while (period.end < to && count < 1200) {
    period = shiftPeriod(period.start, 'month', 1, 0, monthStart)
    count += 1
  }
  return count
}

/** The last day of the month `months` after the one holding `date` (0: that month). */
export function monthEndAfter(date: string, months: number, monthStart: number): string {
  return shiftPeriod(date, 'month', months, 0, monthStart).end
}

/** A goal's target, an emergency fund's from months of Commitments and Needs (BUD-27). */
export function goalTarget(goal: Goal, essentials: number): number | null {
  if (goal.kind === 'emergency' && goal.months !== undefined) return goal.months * essentials
  return goal.target ?? null
}

/** BUD-23: whether the left over pays a goal's monthly need. */
export type Funding = 'funded' | 'partly' | 'unfunded' | 'reached'

/** BUD-21 to BUD-24: one goal against this month's left over. */
export interface GoalPlan {
  goal: Goal
  target: number | null
  progress: number
  /** Still to go; 0 once reached. */
  remaining: number
  /** BUD-21, BUD-22: what it needs each month. */
  need: number
  /** BUD-24: what the left over gives it, in order. */
  funded: number
  funding: Funding
  /** BUD-22, BUD-24: the month it is reached at the funded pace; null when never. */
  projected: string | null
  /** Reached by its date at the funded pace. */
  onTime: boolean
}

export interface GoalFunding {
  goals: GoalPlan[]
  /** BUD-23: what all the goals need each month. */
  need: number
  /** BUD-23: the needs minus the left over, when they don't fit; else 0. */
  gap: number
  /** BUD-12: the left over minus what goals take. */
  free: number
}

/**
 * BUD-21 to BUD-24: each active goal's monthly need, then the left over handed out in
 * the goals' order, so the first ones are funded in full. A goal with a date needs
 * what is left divided by the months left; one with a monthly amount needs that
 * amount, and its date is projected from it. Goals that get less than they need move
 * to the month their funded pace reaches them.
 */
export function fundGoals(
  goals: readonly Goal[],
  progress: ReadonlyMap<string, number>,
  leftOver: number,
  period: Period,
  monthStart: number,
  essentials = 0,
): GoalFunding {
  const active = goals
    .filter((goal) => !goal.paused && goal.done === undefined && goal.kind !== 'afford')
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  let available = Math.max(0, leftOver)
  const plans: GoalPlan[] = []
  for (const goal of active) {
    const target = goalTarget(goal, essentials)
    const done = progress.get(goal.id) ?? 0
    const remaining = target === null ? Number.POSITIVE_INFINITY : Math.max(0, target - done)
    let need = 0
    if (remaining === 0) need = 0
    else if (goal.perMonth !== undefined) need = Math.min(goal.perMonth, remaining)
    else if (goal.by !== undefined) {
      const months = Math.max(1, monthsBetween(period.start, goal.by, monthStart))
      need = Math.ceil(remaining / months)
    }
    const funded = Math.min(need, available)
    available -= funded
    const reached = target !== null && remaining === 0
    let projected: string | null = null
    if (reached) projected = period.start
    else if (target !== null && funded > 0)
      projected = monthEndAfter(period.start, Math.ceil(remaining / funded) - 1, monthStart)
    plans.push({
      goal,
      target,
      progress: done,
      remaining: Number.isFinite(remaining) ? remaining : 0,
      need,
      funded,
      funding: reached
        ? 'reached'
        : need === 0
          ? 'funded'
          : funded >= need
            ? 'funded'
            : funded > 0
              ? 'partly'
              : 'unfunded',
      projected,
      onTime:
        reached ||
        (goal.by === undefined ? projected !== null : projected !== null && projected <= goal.by),
    })
  }
  const need = plans.reduce((sum, plan) => sum + plan.need, 0)
  return {
    goals: plans,
    need,
    gap: Math.max(0, need - leftOver),
    free: leftOver - plans.reduce((sum, plan) => sum + plan.funded, 0),
  }
}

/** BUD-28: paying a debt off at `payment` a month, with the wallet's monthly rate. */
export function payoff(
  owed: number,
  payment: number,
  monthlyRate: number,
): { months: number; interest: number } | null {
  if (owed <= 0) return { months: 0, interest: 0 }
  if (payment <= Math.round(owed * monthlyRate)) return null
  let left = owed
  let months = 0
  let interest = 0
  while (left > 0 && months < 1200) {
    const charged = Math.round(left * monthlyRate)
    interest += charged
    left = left + charged - payment
    months += 1
  }
  return { months, interest }
}

/** BUD-63: the loan a payment repays over `payments` months at `monthlyRate`. */
export function principalFor(payment: number, payments: number, monthlyRate: number): number {
  if (payment <= 0 || payments <= 0) return 0
  if (monthlyRate === 0) return payment * payments
  return Math.round((payment * (1 - (1 + monthlyRate) ** -payments)) / monthlyRate)
}

/** BUD-61 to BUD-64: what a purchase on a date can cost, at two levels. */
export interface Affordability {
  downPayment: number
  /** BUD-62: the largest payment each month; zero or less when nothing is free (BUD-66). */
  payment: { maximum: number; comfortable: number }
  /** BUD-63: with financing, the down payment plus the loan the payment repays. */
  price: { maximum: number; comfortable: number }
}

/**
 * BUD-61 to BUD-64: the down payment is the chosen wallets' balance minus the safety
 * buffer and what other goals already hold in them; the payment is the free left
 * over (comfortable keeps 10% of it unspent); with financing terms, the price adds
 * the loan that payment repays.
 */
export function affordability(input: {
  savings: number
  buffer: number
  heldForGoals: number
  free: number
  monthlyRate: number
  payments: number
}): Affordability {
  const downPayment = Math.max(0, input.savings - input.buffer - input.heldForGoals)
  const maximum = input.free
  const comfortable = Math.round(input.free * 0.9)
  const price = (payment: number) =>
    downPayment +
    (input.payments > 0 ? principalFor(Math.max(0, payment), input.payments, input.monthlyRate) : 0)
  return {
    downPayment,
    payment: { maximum, comfortable },
    price: { maximum: price(maximum), comfortable: price(comfortable) },
  }
}

/** How many days later `after` is than `before`; null when either is unknown. */
export function daysLater(before: string | null, after: string | null): number | null {
  if (before === null || after === null) return null
  return daysBetween(before, after)
}
