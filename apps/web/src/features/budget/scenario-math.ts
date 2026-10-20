import type { ScenarioRecord } from '@repo/api'
import {
  applyScenario,
  changedGoals,
  closeTheGap,
  emptyScenario,
  type Goal,
  type GoalChange,
  type GoalFunding,
  type LineChange,
  type PlanLine,
  type Scenario,
  scenarioAdjustments,
  shiftPeriod,
} from '@repo/core'
import type { RecordChange } from '../wallets/use-ledger'
import { currentPlan, goalChange, planChange } from './records'
import { type Budget, fundWith } from './use-budget'

// BUD-30 to BUD-39: a what-if tried on top of this month's plan, and what using it as
// the plan saves. Everything is worked out in the browser from the decrypted records.

/** A saved what-if as the budget math reads it. */
export function scenarioOf(record: ScenarioRecord | undefined): Scenario {
  if (!record) return emptyScenario
  return {
    changes: record.changes,
    goals: record.goals,
    unlocked: record.unlocked,
    flexibility: record.flexibility,
    steps: record.steps,
    ...(record.income === undefined ? {} : { income: record.income }),
  }
}

/** The record for a what-if, under its name. */
export function recordOf(scenario: Scenario, name: string, createdAt?: string): ScenarioRecord {
  return {
    name,
    changes: [...scenario.changes],
    goals: [...scenario.goals],
    unlocked: [...scenario.unlocked],
    flexibility: [...scenario.flexibility],
    steps: scenario.steps,
    ...(scenario.income === undefined || scenario.income === 0 ? {} : { income: scenario.income }),
    createdAt: createdAt ?? new Date().toISOString(),
  }
}

/** BUD-38: saved what-ifs newest first, by when each was made. */
export function newestFirst<T extends { id: string; createdAt?: string | undefined }>(
  saved: readonly T[],
): T[] {
  return [...saved].sort(
    (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id.localeCompare(a.id),
  )
}

/** Whether two what-ifs hold the same changes, to tell a saved one has unsaved changes. */
export function sameScenario(a: Scenario, b: Scenario) {
  const plain = (scenario: Scenario) => JSON.stringify(recordOf(scenario, '-', '-'))
  return plain(a) === plain(b)
}

/**
 * The lines a what-if starts from: this month's targets without what last month
 * carried in (BUD-52), which is this month's only and no habit to change.
 */
export function whatIfLines(budget: Budget): PlanLine[] {
  return budget.month.lines.map((line) => ({ ...line, target: line.target - line.carry }))
}

/** A line's target before the what-if; 0 for a new expense. */
export function targetBefore(budget: Budget, key: string) {
  const line = budget.month.lines.find((item) => item.key === key)
  return line ? line.target - line.carry : 0
}

/** BUD-32: everything a what-if changes, recomputed on every change. */
export interface Tried {
  /** Each line's target with the changes. */
  targets: Map<string, number>
  /** What the line changes free each month; negative when they spend more. */
  freed: number
  cut: number
  income: number
  leftOver: number
  goals: Goal[]
  funding: GoalFunding
}

export function tryScenario(budget: Budget, scenario: Scenario): Tried {
  const { targets, freed, cut } = applyScenario(whatIfLines(budget), scenario)
  const raise = scenario.income ?? 0
  const leftOver = budget.month.leftOver + freed + raise
  const goals = changedGoals(budget.goals, scenario.goals)
  return {
    targets,
    freed,
    cut,
    income: Math.max(0, budget.month.income + raise),
    leftOver,
    goals,
    funding: fundWith(budget, leftOver, goals),
  }
}

/**
 * BUD-35: the cuts that close what is still short, on Want lines the what-if hasn't
 * changed yet. Each is the new target it suggests, so it never goes below the line's
 * proven month.
 */
export function suggestedCuts(budget: Budget, scenario: Scenario): LineChange[] {
  const gap = tryScenario(budget, scenario).funding.gap
  const changed = new Set(scenario.changes.map((change) => change.line))
  const plan = closeTheGap(
    whatIfLines(budget).filter((line) => !changed.has(line.key)),
    budget.usual.lines,
    gap,
    budget.settings.maxCut,
    scenario,
  )
  return plan.cuts
    .map((cut) => ({
      line: cut.line,
      kind: 'target' as const,
      value: Math.min(targetBefore(budget, cut.line), cut.newTarget),
    }))
    .filter((change) => change.value < targetBefore(budget, change.line))
}

/** One change per line: a new one replaces the line's old one. */
export function withChange(scenario: Scenario, change: LineChange): Scenario {
  return {
    ...scenario,
    changes: [...scenario.changes.filter((item) => item.line !== change.line), change],
  }
}

/** The what-if without a line's change, its unlock (BUD-33) or its kind (BUD-11). */
export function withoutLine(scenario: Scenario, key: string, categoryId: string): Scenario {
  return {
    ...scenario,
    changes: scenario.changes.filter((item) => item.line !== key),
    unlocked: scenario.unlocked.filter((line) => line !== key),
    flexibility: scenario.flexibility.filter((item) => item.categoryId !== categoryId),
  }
}

/** BUD-31: one change per goal; null takes the goal's change out. */
export function withGoalChange(
  scenario: Scenario,
  goalId: string,
  change: GoalChange | null,
): Scenario {
  const others = scenario.goals.filter((item) => item.goalId !== goalId)
  return { ...scenario, goals: change ? [...others, change] : others }
}

/** Whether the what-if changes anything at all. */
export function changesAnything(scenario: Scenario) {
  return (
    scenario.changes.length > 0 ||
    (scenario.income ?? 0) !== 0 ||
    scenario.goals.length > 0 ||
    scenario.flexibility.length > 0
  )
}

/** BUD-39: the budget month holding today and the one after it. */
export function startChoices(budget: Budget) {
  const now = budget.month.period
  return { now, next: shiftPeriod(now.start, 'month', 1, 0, budget.settings.startDay) }
}

/**
 * BUD-39: using a what-if as the plan from the month starting `from`. Its line
 * changes become adjustments (BUD-37, BUD-40) that take each line from where the plan
 * stands to the what-if's target; more or less income becomes the income expected
 * from then (this month keeps its own when the plan starts next month); goal changes
 * are saved on the goals. Treating a category as another kind stays inside the
 * what-if (BUD-11): the category's own kind changes only from its screen.
 */
export function activation(
  budget: Budget,
  scenario: Scenario,
  from: string,
  scenarioId?: string,
): RecordChange[] {
  const { ledger, month } = budget
  const plan = currentPlan(ledger)
  const adjustments = scenarioAdjustments(
    whatIfLines(budget),
    scenario,
    from,
    plan.adjustments,
    budget.settings.startDay,
  )
  const raise = scenario.income ?? 0
  const keepsOwn = plan.incomeByPeriod?.some((item) => item.start === month.period.start)
  const incomeByPeriod =
    from > month.period.start && !keepsOwn
      ? [...(plan.incomeByPeriod ?? []), { start: month.period.start, amount: month.income }]
      : plan.incomeByPeriod
  const changes: RecordChange[] = [
    planChange(ledger, {
      adjustments,
      ...(raise === 0 ? {} : { income: Math.max(0, month.income + raise), incomeByPeriod }),
      ...(scenarioId ? { scenarioId } : {}),
    }),
  ]
  for (const change of scenario.goals) {
    const record = ledger.goals.find((goal) => goal.id === change.goalId)
    if (!record) continue
    const [goal] = changedGoals([record], [change])
    if (goal) changes.push(goalChange(record.id, goal))
  }
  return changes
}
