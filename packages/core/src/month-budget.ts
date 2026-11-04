import type { MonthTargets } from './budget.ts'
import { daysBetween, type Period, shiftPeriod } from './dates.ts'

// Epic 6, a budget for each month (BUD-70 to BUD-75): the contract the person locks in
// for a month, which nothing changes but their own edits. Pure functions; the caller
// passes the first day of the month holding today.

/** BUD-70, BUD-71: one month's budget as its encrypted record keeps it. */
export interface MonthBudgetRecord {
  start: string
  targets: readonly { line: string; amount: number }[]
  income: number
  lockedAt?: string | undefined
}

/**
 * BUD-71, BUD-73, BUD-74: where a month stands. Locked: the person locked it in.
 * Carried: it began without being locked in, so it carries on with its draft or the
 * last budget before it. Draft: still being made, this month before the first lock-in
 * or a month ahead. None: a month gone by that never had a budget.
 */
export type MonthState = 'locked' | 'carried' | 'draft' | 'none'

export interface MonthBudget {
  start: string
  state: MonthState
  /** Its targets and income; null while a draft starts from the starting amounts. */
  budget: MonthTargets | null
  /** BUD-73: the month whose budget it carries on with or starts from; null when it has its own. */
  from: string | null
  /** Its own record, a draft's included. */
  record: MonthBudgetRecord | null
}

function targetsOf(record: MonthBudgetRecord): MonthTargets {
  return {
    targets: new Map(record.targets.map((item) => [item.line, item.amount])),
    income: record.income,
  }
}

/**
 * BUD-71, BUD-73: the records in force, oldest first. A locked one always is; with
 * carrying on, a draft is too once its month has begun and an earlier month had a
 * budget, since that month then runs on it.
 */
export function budgetsInForce(
  records: readonly MonthBudgetRecord[],
  current: string,
  carryOn = true,
): MonthBudgetRecord[] {
  const inForce: MonthBudgetRecord[] = []
  for (const record of [...records].sort((a, b) => a.start.localeCompare(b.start)))
    if (record.lockedAt !== undefined || (carryOn && record.start <= current && inForce.length > 0))
      inForce.push(record)
  return inForce
}

/**
 * BUD-70 to BUD-74: the budget of the month starting `start`, given the first day of
 * the month holding today (`current`). A month locked in keeps its own. A month that
 * has begun without one carries on with its draft, else the last budget before it
 * (BUD-73), once any earlier month was budgeted. A month that hasn't begun, or this
 * month before the first lock-in, is a draft that starts from its own record, the last
 * budget before it, or the starting amounts. Any other month gone by has none (BUD-74).
 */
export function monthBudget(
  records: readonly MonthBudgetRecord[],
  start: string,
  current: string,
  carryOn = true,
): MonthBudget {
  const own = records.find((record) => record.start === start) ?? null
  const inForce = budgetsInForce(records, current, carryOn)
  const before = inForce.filter((record) => record.start < start).at(-1) ?? null
  if (own?.lockedAt !== undefined)
    return { start, state: 'locked', budget: targetsOf(own), from: null, record: own }
  if (own && inForce.includes(own))
    return { start, state: 'carried', budget: targetsOf(own), from: null, record: own }
  if (carryOn && start <= current && before)
    return { start, state: 'carried', budget: targetsOf(before), from: before.start, record: null }
  if (start < current) return { start, state: 'none', budget: null, from: null, record: own }
  if (own) return { start, state: 'draft', budget: targetsOf(own), from: null, record: own }
  return {
    start,
    state: 'draft',
    budget: before ? targetsOf(before) : null,
    from: before?.start ?? null,
    record: null,
  }
}

/** Whether a month has a budget to track, review and show (BUD-74). */
export function budgeted(month: Pick<MonthBudget, 'state'>): boolean {
  return month.state === 'locked' || month.state === 'carried'
}

/** BUD-70: how many months ahead a budget can be made. */
export const monthsAhead = 12

/**
 * BUD-70, BUD-74: the months the month bar moves through: from the first one budgeted
 * (else this month) to `monthsAhead` months after this one.
 */
export function budgetMonths(
  records: readonly MonthBudgetRecord[],
  current: string,
  monthStart: number,
  carryOn = true,
): { first: string; last: string } {
  const first = budgetsInForce(records, current, carryOn)[0]?.start
  return {
    first: first !== undefined && first < current ? first : current,
    last: shiftPeriod(current, 'month', monthsAhead, 0, monthStart).start,
  }
}

/** BUD-75: how many days before a month begins the current month asks for its budget. */
export const nudgeDays = 14

/**
 * BUD-75: the next month, while it has no budget locked in and begins within
 * `nudgeDays` of today; null otherwise.
 */
export function nextToPlan(
  records: readonly MonthBudgetRecord[],
  current: Period,
  today: string,
  monthStart: number,
): { start: string; days: number } | null {
  const next = shiftPeriod(current.start, 'month', 1, 0, monthStart).start
  if (records.some((record) => record.start === next && record.lockedAt !== undefined)) return null
  const days = daysBetween(today, next)
  return days > 0 && days <= nudgeDays ? { start: next, days } : null
}

/** BUD-71: a month's budget as a record: every line with a target, and its income. */
export function monthRecord(
  start: string,
  targets: ReadonlyMap<string, number>,
  income: number,
  lockedAt?: string,
): MonthBudgetRecord {
  return {
    start,
    targets: [...targets]
      .filter(([, amount]) => amount > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([line, amount]) => ({ line, amount })),
    income: Math.max(0, income),
    ...(lockedAt === undefined ? {} : { lockedAt }),
  }
}
