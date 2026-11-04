import { median } from './analysis.ts'
import type { Flexibility } from './categories.ts'

// Epic 6, closing a month (BUD-50 to BUD-57): what the review proposes and what it
// keeps. Pure functions; the caller passes the month's plan as it was.

/** One line of a month's plan as the review reads it. */
export interface ClosedLine {
  line: string
  flexibility: Flexibility
  target: number
  spent: number
}

/** BUD-51: what a goal still lacked this month, in the goals' order. */
export interface UnmetGoal {
  goalId: string
  unmet: number
}

/**
 * BUD-51: the extra over the planned left over, handed to the goals in their order,
 * each up to what it still lacked this month. What is left after them stays
 * unassigned.
 */
export function surplusByOrder(
  extra: number,
  goals: readonly UnmetGoal[],
): { goalId: string; amount: number }[] {
  let left = Math.max(0, extra)
  return goals.map((goal) => {
    const amount = Math.min(left, Math.max(0, goal.unmet))
    left -= amount
    return { goalId: goal.goalId, amount }
  })
}

/** BUD-54: a Want that went over its target in each of the months, oldest first. */
export interface Missed {
  line: string
  /** What it spent each month, oldest first. */
  spent: number[]
  /** The latest month's target. */
  target: number
  /** The target that would have held: the median of those months, never below the target. */
  eased: number
}

/**
 * BUD-54: the Want lines over target in every one of the months given (the last
 * `count`, oldest first), with an easier target: the middle of what they spent.
 */
export function missedInARow(months: readonly (readonly ClosedLine[])[], count = 3): Missed[] {
  if (months.length < count) return []
  const recent = months.slice(-count)
  const latest = recent.at(-1) ?? []
  const missed: Missed[] = []
  for (const line of latest) {
    if (line.flexibility !== 'flexible') continue
    const each = recent.map((month) => month.find((item) => item.line === line.line))
    if (!each.every((item) => item !== undefined && item.target > 0 && item.spent > item.target))
      continue
    const spent = each.map((item) => item?.spent ?? 0)
    const middle = Math.round(median(spent) ?? line.target)
    missed.push({
      line: line.line,
      spent,
      target: line.target,
      eased: Math.max(line.target, middle),
    })
  }
  return missed.sort((a, b) => b.eased - b.target - (a.eased - a.target))
}

/** BUD-52: what each chosen line carries into the next month: what was left, or minus what went over. */
export function carryOver(
  lines: readonly ClosedLine[],
  chosen: ReadonlySet<string>,
): { line: string; amount: number }[] {
  return lines
    .filter((line) => chosen.has(line.line) && line.target !== line.spent)
    .map((line) => ({ line: line.line, amount: line.target - line.spent }))
}

/** BUD-57: one goal's projected date at each close, oldest first. */
export interface GoalDates {
  goalId: string
  name: string
  dates: { start: string; projected: string | null }[]
}

/** BUD-57: how each goal's projected date moved from one closed month to the next. */
export function goalDates(
  snapshots: readonly {
    start: string
    goals: readonly { goalId: string; name: string; projected?: string | undefined }[]
  }[],
): GoalDates[] {
  const byGoal = new Map<string, GoalDates>()
  for (const snapshot of [...snapshots].sort((a, b) => a.start.localeCompare(b.start)))
    for (const goal of snapshot.goals) {
      let entry = byGoal.get(goal.goalId)
      if (!entry) {
        entry = { goalId: goal.goalId, name: goal.name, dates: [] }
        byGoal.set(goal.goalId, entry)
      }
      // The latest name wins, in case it was renamed.
      entry.name = goal.name
      entry.dates.push({ start: snapshot.start, projected: goal.projected ?? null })
    }
  return [...byGoal.values()]
}
