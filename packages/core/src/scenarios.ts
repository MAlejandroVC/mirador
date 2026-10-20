import type { Flexibility } from './categories.ts'
import { type Adjustment, adjustmentIn, type LineBaseline, type PlanLine } from './budget.ts'
import { type Period, shiftPeriod } from './dates.ts'
import { type Goal, type GoalFunding, monthsBetween } from './goals.ts'

// Epic 6, what-ifs (BUD-30 to BUD-39): changes tried on top of the plan without
// touching it, and the cuts the app suggests to close the gap. Pure functions.

/** BUD-30: a change to one line: by a share, by an amount, or to a new target. */
export interface LineChange {
  line: string
  kind: 'percent' | 'amount' | 'target'
  /** A share (−0.15 is 15% less), an amount per month (negative is less), or a target. */
  value: number
}

/** BUD-31: a goal changed in a what-if. */
export interface GoalChange {
  goalId: string
  target?: number
  by?: string
  perMonth?: number
}

export interface Scenario {
  changes: readonly LineChange[]
  /** BUD-31: more (or less) income each month. */
  income?: number
  goals: readonly GoalChange[]
  /** BUD-33: Commitment lines the person unlocked in this what-if. */
  unlocked: readonly string[]
  /** BUD-11: categories treated as another kind in this what-if only. */
  flexibility: readonly { categoryId: string; flexibility: Flexibility }[]
  /** BUD-37: reach the cuts over this many months; 1 for at once. */
  steps: number
}

export const emptyScenario: Scenario = {
  changes: [],
  goals: [],
  unlocked: [],
  flexibility: [],
  steps: 1,
}

/** BUD-30: a line's target once a change applies; never below zero. */
export function changedTarget(target: number, change: LineChange): number {
  switch (change.kind) {
    case 'percent':
      return Math.max(0, Math.round(target * (1 + change.value)))
    case 'amount':
      return Math.max(0, target + change.value)
    case 'target':
      return Math.max(0, change.value)
  }
}

/** BUD-11: a line's kind in a what-if. */
export function flexibilityIn(
  line: Pick<PlanLine, 'categoryId' | 'flexibility'>,
  scenario: Scenario,
): Flexibility {
  return (
    scenario.flexibility.find((item) => item.categoryId === line.categoryId)?.flexibility ??
    line.flexibility
  )
}

/** BUD-33: whether a what-if may change a line: Commitments only once unlocked. */
export function canChange(
  line: Pick<PlanLine, 'key' | 'categoryId' | 'flexibility'>,
  scenario: Scenario,
): boolean {
  return flexibilityIn(line, scenario) !== 'locked' || scenario.unlocked.includes(line.key)
}

/** BUD-32: every line's target with the what-if's changes, and the money they free. */
export function applyScenario(
  lines: readonly Pick<PlanLine, 'key' | 'categoryId' | 'flexibility' | 'target'>[],
  scenario: Scenario,
): { targets: Map<string, number>; freed: number; cut: number } {
  const targets = new Map(lines.map((line) => [line.key, line.target]))
  let freed = 0
  let cut = 0
  for (const change of scenario.changes) {
    const line = lines.find((item) => item.key === change.line)
    const before = targets.get(change.line) ?? 0
    // BUD-33: a locked Commitment stays as it is; a line not in the plan is a new expense.
    if (line && !canChange(line, scenario)) continue
    const after = changedTarget(before, change)
    targets.set(change.line, after)
    freed += before - after
    if (after < before) cut += before - after
  }
  return { targets, freed, cut }
}

/** BUD-34: a monthly amount per week and per year (12 months, 52 weeks). */
export function perWeekAndYear(perMonth: number): { week: number; year: number } {
  return { week: Math.round((perMonth * 12) / 52), year: perMonth * 12 }
}

/** BUD-34: about how many purchases a month an amount is, at the usual purchase. */
export function fewerPurchases(perMonth: number, averageTicket: number): number {
  if (averageTicket <= 0) return 0
  return Math.round(perMonth / averageTicket)
}

/**
 * BUD-34: for a cut smaller than one purchase a month, about how many months go by per
 * purchase it saves ("1 fewer flight every 7 months"); 0 when it has no usual purchase.
 */
export function monthsPerFewerPurchase(perMonth: number, averageTicket: number): number {
  if (perMonth <= 0 || averageTicket <= 0) return 0
  return Math.round(averageTicket / perMonth)
}

/** BUD-35: one suggested cut, with the month the person last spent that little. */
export interface SuggestedCut {
  line: string
  cut: number
  /** As a share of the usual month, in steps of 5%. */
  share: number
  newTarget: number
  /** The latest month spent at or below the new target; null when none was. */
  lastTime: { period: Period; spent: number } | null
}

export interface GapPlan {
  cuts: SuggestedCut[]
  freed: number
  /** BUD-36: what the cuts can't cover; 0 when the gap is closed. */
  short: number
}

/**
 * BUD-35, BUD-36: cuts across Want lines that close `gap`. Lines with the most room
 * between their usual and proven month come first, weighted up when they are large,
 * growing or variable. Each cut goes in 5% steps, no deeper than `maxCut` of the usual
 * month and never below the proven level.
 */
export function closeTheGap(
  lines: readonly Pick<PlanLine, 'key' | 'flexibility' | 'categoryId'>[],
  usual: readonly LineBaseline[],
  gap: number,
  maxCut: number,
  scenario: Scenario = emptyScenario,
): GapPlan {
  if (gap <= 0) return { cuts: [], freed: 0, short: 0 }
  const byKey = new Map(usual.map((line) => [line.key, line]))
  const candidates = lines
    .filter((line) => flexibilityIn(line, scenario) === 'flexible')
    .map((line) => byKey.get(line.key))
    .filter((line): line is LineBaseline => line !== undefined && line.baseline > 0)
    .map((line) => ({ line, room: Math.max(0, line.baseline - line.proven) }))
    .filter((item) => item.room > 0)
    .map((item) => ({
      ...item,
      score:
        item.room *
        (1 + Math.max(0, item.line.trend ?? 0) + item.line.variability) *
        (1 + item.line.share),
    }))
    .sort((a, b) => b.score - a.score || a.line.key.localeCompare(b.line.key))

  const cuts: SuggestedCut[] = []
  let left = gap
  for (const { line, room } of candidates) {
    if (left <= 0) break
    const steps = Math.max(1, Math.ceil(left / line.baseline / 0.05 - 1e-9))
    const share = Math.min(maxCut, steps * 0.05)
    const cut = Math.min(Math.round(line.baseline * share), room)
    if (cut <= 0) continue
    const newTarget = line.baseline - cut
    const last = [...line.months]
      .reverse()
      .find((month) => !month.excluded && month.spent <= newTarget)
    cuts.push({
      line: line.key,
      cut,
      share: cut / line.baseline,
      newTarget,
      lastTime: last ? { period: last.period, spent: last.spent } : null,
    })
    left -= cut
  }
  const freed = cuts.reduce((sum, item) => sum + item.cut, 0)
  return { cuts, freed, short: Math.max(0, gap - freed) }
}

/** BUD-34, BUD-35: the latest month counted that a line spent no more than `target`. */
export function lastTimeAtMost(
  line: Pick<LineBaseline, 'months'>,
  target: number,
): { period: Period; spent: number } | null {
  const last = [...line.months].reverse().find((month) => !month.excluded && month.spent <= target)
  return last ? { period: last.period, spent: last.spent } : null
}

/**
 * BUD-31: the goals with a what-if's changes. A goal has a date or an amount each
 * month, never both, so setting one clears the other.
 */
export function changedGoals<G extends Goal>(
  goals: readonly G[],
  changes: readonly GoalChange[],
): G[] {
  return goals.map((goal) => {
    const change = changes.find((item) => item.goalId === goal.id)
    if (!change) return goal
    const next: G = { ...goal }
    if (change.target !== undefined) next.target = change.target
    if (change.by !== undefined) {
      next.by = change.by
      delete next.perMonth
    }
    if (change.perMonth !== undefined) {
      next.perMonth = change.perMonth
      delete next.by
    }
    return next
  })
}

/**
 * BUD-37, BUD-39: an adjustment held where it stands in the month starting `at`: the
 * steps it reached by then stay, the rest never come. Null when it has reached nothing.
 */
export function heldAt(adjustment: Adjustment, at: string, monthStart: number): Adjustment | null {
  const reached = adjustmentIn(adjustment, at, monthStart)
  if (reached === 0) return null
  if (reached === adjustment.change) return adjustment
  let steps = 1
  let cursor = adjustment.from
  while (cursor < at && steps < adjustment.steps) {
    cursor = shiftPeriod(cursor, 'month', 1, 0, monthStart).start
    steps += 1
  }
  return { ...adjustment, change: reached, steps }
}

/**
 * BUD-37, BUD-39: the plan's adjustments once a what-if is used from the month starting
 * `from`. `lines` carry the targets the what-if started from and their `base`, before
 * any adjustment. A changed line keeps what its earlier adjustments reached by the
 * month before `from`, held there so they stop growing, and gets a new one that takes
 * it to the what-if's target: a cut over the what-if's steps, more spending, such as a
 * new expense, at once. Its adjustments from `from` on give way; other lines keep theirs.
 */
export function scenarioAdjustments(
  lines: readonly Pick<PlanLine, 'key' | 'categoryId' | 'flexibility' | 'target' | 'base'>[],
  scenario: Scenario,
  from: string,
  existing: readonly Adjustment[] = [],
  monthStart = 1,
): Adjustment[] {
  const { targets } = applyScenario(lines, scenario)
  const touched = new Map<string, number>()
  for (const key of new Set(scenario.changes.map((change) => change.line))) {
    const before = lines.find((line) => line.key === key)?.target ?? 0
    const after = targets.get(key) ?? before
    if (after !== before) touched.set(key, after)
  }
  const kept = existing.filter((adjustment) => !touched.has(adjustment.line))
  const previous = shiftPeriod(from, 'month', -1, 0, monthStart).start
  for (const [key, after] of touched) {
    const held = existing
      .filter((adjustment) => adjustment.line === key && adjustment.from < from)
      .map((adjustment) => heldAt(adjustment, previous, monthStart))
      .filter((adjustment) => adjustment !== null)
    const start =
      (lines.find((line) => line.key === key)?.base ?? 0) +
      held.reduce((sum, adjustment) => sum + adjustment.change, 0)
    const change = after - start
    kept.push(...held)
    if (change !== 0) kept.push({ line: key, change, steps: change < 0 ? scenario.steps : 1, from })
  }
  return kept
}

/** BUD-36: a change to one goal that would make it fit what is left for it. */
export interface GoalOffer {
  kind: 'later' | 'lower'
  change: GoalChange
}

/**
 * BUD-36: when cuts can't close the gap, each goal that gets only part of what it
 * needs can move to the date its funded pace reaches, or ask for less: a smaller
 * target by its date, or the monthly amount it does get.
 */
export function goalOffers(funding: GoalFunding, period: Period, monthStart: number): GoalOffer[] {
  const offers: GoalOffer[] = []
  for (const plan of funding.goals) {
    if (plan.funding !== 'partly') continue
    const { goal } = plan
    if (goal.by !== undefined && plan.target !== null) {
      if (plan.projected !== null && plan.projected > goal.by)
        offers.push({ kind: 'later', change: { goalId: goal.id, by: plan.projected } })
      // An emergency fund's target comes from its months, so only its date can move.
      if (goal.months === undefined) {
        const lower = plan.progress + plan.funded * monthsBetween(period.start, goal.by, monthStart)
        if (lower > plan.progress && lower < plan.target)
          offers.push({ kind: 'lower', change: { goalId: goal.id, target: lower } })
      }
    } else if (goal.perMonth !== undefined)
      offers.push({ kind: 'lower', change: { goalId: goal.id, perMonth: plan.funded } })
  }
  return offers
}
