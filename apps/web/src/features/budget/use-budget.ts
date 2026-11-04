import type { BudgetPlanRecord } from '@repo/api'
import {
  addDays,
  type AnalysisContext,
  type AnalysisEntry,
  type AnalysisView,
  analysisEntries,
  type Baseline,
  baseline,
  budgeted,
  budgetMonthOf,
  budgetsInForce,
  type BudgetSettings,
  type CommittedItem,
  committed,
  type Contribution,
  defaultBudgetSettings,
  fundGoals,
  type Goal,
  type GoalBalances,
  type GoalFunding,
  goalProgress,
  type MonthBudget,
  monthBudget,
  monthsAhead,
  noExclusions,
  type Period,
  type PlanMonth,
  type PlanSettings,
  planMonth,
  planSplit,
  shiftPeriod,
  startingAmounts,
  toCalendarDate,
  walletGoalBalances,
} from '@repo/core'
import { useMemo } from 'react'
import { type Taxonomy, taxonomy } from '../categories/lookups'
import { type Ledger, useLedger } from '../wallets/use-ledger'

// Epic 6: everything the Plan side of Budget and its screens work from, computed once
// per change from the decrypted records, all in the browser (SEC-01).

export interface Budget {
  ledger: Ledger
  lookups: Taxonomy
  context: AnalysisContext
  today: string
  settings: BudgetSettings
  plan: PlanSettings
  /** The budget month holding today (SYS-02). */
  view: AnalysisView
  /** Every budget entry up to today; wallets left out of the budget are already gone (WAL-09). */
  entries: AnalysisEntry[]
  /** BUD-01: the starting amounts, from the complete months before this one. */
  usual: Baseline
  /** BUD-70 to BUD-73: this month's budget: locked in, carried on, or still a draft. */
  current: MonthBudget
  /** This month against its budget, or against the starting amounts while it is a draft. */
  month: PlanMonth
  /** BUD-20: every goal in its order, done and paused ones included. */
  goals: Goal[]
  contributions: Contribution[]
  /** BUD-25, BUD-26: how far each goal has come. */
  progress: Map<string, number>
  balances: GoalBalances
  /** BUD-21 to BUD-24: this month's left over handed out to the goals. */
  funding: GoalFunding
  /** BUD-27: a month of Commitments and Needs. */
  essentials: number
  /** BUD-06: at least one month of history, or amounts entered by hand. */
  ready: boolean
  /** BUD-50, BUD-74: the month just ended, while it waits for its review, if it had a budget. */
  review: Period | null
}

/** The plan record as the budget math reads it; no record yet counts everything. */
export function planSettingsOf(record: BudgetPlanRecord | null): PlanSettings {
  if (!record) return { exclusions: noExclusions, tagLines: [] }
  return {
    exclusions: record.exclusions,
    tagLines: record.tagLines,
    ...(record.estimates ? { estimates: record.estimates } : {}),
  }
}

export function budgetSettingsOf(ledger: Ledger): BudgetSettings {
  return ledger.preferences?.budget ?? defaultBudgetSettings
}

/** The month view the budget math takes, for any budget month. */
export function monthViewOf(budget: Pick<Budget, 'view'>, period: Period): AnalysisView {
  return { ...budget.view, period }
}

/** The budget month starting `start` (SYS-02). */
export function periodOf(budget: Pick<Budget, 'settings'>, start: string): Period {
  return shiftPeriod(start, 'month', 0, 0, budget.settings.startDay)
}

/** BUD-52: what last month's close carried into the month starting `start`. */
export function carryInto(ledger: Ledger, start: string) {
  return ledger.snapshots.find((snapshot) => snapshot.end === addDays(start, -1))?.carry ?? []
}

/** BUD-70 to BUD-74: where any month's budget stands. */
export function monthOf(budget: Pick<Budget, 'ledger' | 'view'>, start: string): MonthBudget {
  return monthBudget(budget.ledger.months, start, budget.view.period.start)
}

/** Where a month falls against the one holding today. */
export type MonthPlace = 'past' | 'current' | 'ahead'

export function placeOf(budget: Pick<Budget, 'view'>, start: string): MonthPlace {
  const current = budget.view.period.start
  return start < current ? 'past' : start === current ? 'current' : 'ahead'
}

/**
 * BUD-70: what a month's draft starts from: the last budget in force before it, or the
 * starting amounts when there is none (`from` null).
 */
export function startsFrom(
  budget: Pick<Budget, 'ledger' | 'view' | 'usual' | 'plan'>,
  start: string,
): { from: string | null; targets: ReadonlyMap<string, number> } {
  const before = budgetsInForce(budget.ledger.months, budget.view.period.start)
    .filter((record) => record.start < start)
    .at(-1)
  if (before)
    return {
      from: before.start,
      targets: new Map(before.targets.map((item) => [item.line, item.amount])),
    }
  return { from: null, targets: startingAmounts(budget.usual, budget.plan.estimates) }
}

/**
 * BUD-35: where Find money opens from elsewhere, such as a goal: this month's budget,
 * being made or edited.
 */
export function findMoneySearch(budget: Budget) {
  const start = budget.view.period.start
  return budgeted(budget.current)
    ? { month: start, edit: true as const, find: true as const }
    : { find: true as const }
}

/**
 * BUD-40, BUD-70: a month against its budget, or against the starting amounts (or the
 * budget it starts from) while it is still being made. `all` keeps every line there
 * was spending to start from, for making the budget.
 */
export function planFor(budget: Budget, period: Period, options: { all?: boolean } = {}) {
  const month = monthOf(budget, period.start)
  return planMonth(
    budget.entries,
    monthViewOf(budget, period),
    budget.ledger.categories,
    budget.usual,
    budget.plan,
    budget.settings,
    month.budget,
    { carry: carryInto(budget.ledger, period.start), ...options },
  )
}

/**
 * ANA-27, BUD-77: the installment parts and recurring expenses still to come, as the
 * budget counts them (WAL-09, BUD-44), through the last month a budget can be made for.
 */
export function committedItems(
  budget: Pick<Budget, 'ledger' | 'context' | 'today'>,
): CommittedItem[] {
  const { ledger } = budget
  const kept = new Set(
    ledger.wallets.filter((wallet) => wallet.inBudget).map((wallet) => wallet.id),
  )
  return committed(
    ledger.transactions.filter(
      (transaction) => kept.has(transaction.walletId) && transaction.excludeFromBudget !== true,
    ),
    ledger.recurring.filter((recurring) => kept.has(recurring.walletId)),
    budget.context,
    budget.today,
    monthsAhead + 2,
  ).flatMap((month) => month.items)
}

/** BUD-21 to BUD-24 with another left over or other goals, from a month on. */
export function fundWith(
  budget: Budget,
  leftOver: number,
  goals: readonly Goal[] = budget.goals,
  period: Period = budget.month.period,
) {
  return fundGoals(
    goals,
    budget.progress,
    leftOver,
    period,
    budget.settings.startDay,
    budget.essentials,
  )
}

export function buildBudget(ledger: Ledger, today: string): Budget {
  const settings = budgetSettingsOf(ledger)
  const plan = planSettingsOf(ledger.plan)
  const wallets = new Map(ledger.wallets.map((wallet) => [wallet.id, wallet]))
  const context: AnalysisContext = {
    walletCurrency: new Map(ledger.wallets.map((wallet) => [wallet.id, wallet.currency])),
    currency: ledger.defaultCurrency,
    rates: ledger.rates,
    categories: ledger.categories,
  }
  // WAL-09, BUD-44: a wallet left out of the budget never counts here, and the budget
  // looks back, never ahead.
  const kept = ledger.transactions.filter(
    (transaction) => wallets.get(transaction.walletId)?.inBudget === true,
  )
  const entries = analysisEntries(kept, context).filter((entry) => entry.date <= today)
  const view: AnalysisView = {
    period: budgetMonthOf(today, settings.startDay),
    scope: 'month',
    firstDay: 0,
    monthStart: settings.startDay,
    today,
    firstDate: entries[0]?.date ?? null,
  }
  // BUD-03, BUD-44: the starting amounts never count what was left out of the budget.
  const usual = baseline(
    entries.filter((entry) => !entry.excluded),
    view,
    { lookback: settings.lookback, exclusions: plan.exclusions, tagLines: plan.tagLines },
  )
  const current = monthBudget(ledger.months, view.period.start, view.period.start)
  const month = planMonth(entries, view, ledger.categories, usual, plan, settings, current.budget, {
    carry: carryInto(ledger, view.period.start),
  })
  const split = planSplit(month.lines)
  const essentials = split.locked + split.fixed
  const goals: Goal[] = ledger.goals
  const balances = walletGoalBalances(
    ledger.wallets,
    ledger.transactions,
    ledger.defaultCurrency,
    ledger.rates,
  )
  const progress = new Map(
    goals.map((goal) => [goal.id, goalProgress(goal, ledger.contributions, balances, today)]),
  )
  const funding = fundGoals(
    goals,
    progress,
    month.leftOver,
    month.period,
    settings.startDay,
    essentials,
  )
  const ready =
    usual.counted.length > 0 || (plan.estimates?.length ?? 0) > 0 || ledger.months.length > 0
  // BUD-50, BUD-74: last month is offered for review until it is closed, only when it
  // had a budget to review it against.
  const previous = shiftPeriod(view.period.start, 'month', -1, 0, settings.startDay)
  const closed = ledger.snapshots.some((snapshot) => snapshot.start === previous.start)
  const lived = entries.some((entry) => entry.date >= previous.start && entry.date <= previous.end)
  const had = budgeted(monthBudget(ledger.months, previous.start, view.period.start))
  const review = had && lived && !closed ? previous : null

  return {
    ledger,
    lookups: taxonomy(ledger),
    context,
    today,
    settings,
    plan,
    view,
    entries,
    usual,
    current,
    month,
    goals,
    contributions: ledger.contributions,
    progress,
    balances,
    funding,
    essentials,
    ready,
    review,
  }
}

/** The budget for this month, or null while the records load. */
export function useBudget(): Budget | null {
  const { data: ledger } = useLedger()
  const today = toCalendarDate(new Date())
  return useMemo(() => (ledger ? buildBudget(ledger, today) : null), [ledger, today])
}
