import type { BudgetPlanRecord } from '@repo/api'
import {
  addDays,
  type AnalysisContext,
  type AnalysisEntry,
  type AnalysisView,
  analysisEntries,
  type Baseline,
  budgetMonthOf,
  type BudgetSettings,
  type Contribution,
  defaultBudgetSettings,
  fundGoals,
  type Goal,
  type GoalBalances,
  type GoalFunding,
  goalProgress,
  noExclusions,
  type Period,
  type PlanMonth,
  type PlanSettings,
  planMonth,
  planSplit,
  shiftPeriod,
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
  month: PlanMonth
  usual: Baseline
  /** BUD-20: every goal in its order, done and paused ones included. */
  goals: Goal[]
  contributions: Contribution[]
  /** BUD-25, BUD-26: how far each goal has come. */
  progress: Map<string, number>
  balances: GoalBalances
  /** BUD-21 to BUD-24: the left over handed out to the goals. */
  funding: GoalFunding
  /** BUD-27: a month of Commitments and Needs. */
  essentials: number
  /** BUD-06: at least one month of history, or amounts entered by hand. */
  ready: boolean
  /** BUD-50: the month just ended, while it waits for its review. */
  review: Period | null
}

/** The plan record as the budget math reads it; no record yet means the usual month as is. */
export function planSettingsOf(record: BudgetPlanRecord | null): PlanSettings {
  if (!record) return { targets: [], adjustments: [], exclusions: noExclusions, tagLines: [] }
  return {
    targets: record.targets,
    adjustments: record.adjustments,
    exclusions: record.exclusions,
    tagLines: record.tagLines,
    ...(record.income === undefined ? {} : { income: record.income }),
    ...(record.incomeByPeriod ? { incomeByPeriod: record.incomeByPeriod } : {}),
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

/** BUD-52: what last month's close carried into the month starting `start`. */
export function carryInto(ledger: Ledger, start: string) {
  return ledger.snapshots.find((snapshot) => snapshot.end === addDays(start, -1))?.carry ?? []
}

/** The plan for another month, such as the one being reviewed (BUD-50). */
export function planFor(budget: Budget, period: Period, plan: PlanSettings = budget.plan) {
  return planMonth(
    budget.entries,
    monthViewOf(budget, period),
    budget.ledger.categories,
    plan,
    budget.settings,
    carryInto(budget.ledger, period.start),
  )
}

/** BUD-21 to BUD-24 with another left over or other goals, as a what-if tries them. */
export function fundWith(budget: Budget, leftOver: number, goals: readonly Goal[] = budget.goals) {
  return fundGoals(
    goals,
    budget.progress,
    leftOver,
    budget.month.period,
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
  const { month, baseline: usual } = planMonth(
    entries,
    view,
    ledger.categories,
    plan,
    settings,
    carryInto(ledger, view.period.start),
  )
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
    usual.counted.length > 0 || (plan.estimates?.length ?? 0) > 0 || plan.targets.length > 0
  // BUD-50: last month is offered for review until it is closed, once there is a plan
  // to review it against.
  const previous = shiftPeriod(view.period.start, 'month', -1, 0, settings.startDay)
  const closed = ledger.snapshots.some((snapshot) => snapshot.start === previous.start)
  const lived = entries.some((entry) => entry.date >= previous.start && entry.date <= previous.end)
  const review = ready && lived && !closed ? previous : null

  return {
    ledger,
    lookups: taxonomy(ledger),
    context,
    today,
    settings,
    plan,
    view,
    entries,
    month,
    usual,
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
