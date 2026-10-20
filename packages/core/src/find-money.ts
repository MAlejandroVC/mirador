import type { LineBaseline, PlanLine } from './budget.ts'
import type { Period } from './dates.ts'
import { type GoalFunding, monthsBetween } from './goals.ts'

// Epic 6, Find money for your goals (BUD-34 to BUD-36): the cuts the app suggests in a
// month's budget so its goals fit, said as habits, and what to change in the goals
// when cuts can't make room. Pure functions.

/** BUD-36: a goal with a later date, a smaller target or less each month. */
export interface GoalChange {
  goalId: string
  target?: number
  by?: string
  perMonth?: number
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
  /** As a share of the line's target, in steps of 5%. */
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
 * BUD-35, BUD-36: Find money for your goals: cuts across a month's Want lines that close
 * `gap`. Lines with the most room between their target and their proven month come
 * first, weighted up when they are large, growing or variable. Each cut goes in 5%
 * steps, no deeper than `maxCut` of the line's target and never below the proven level
 * or what the month has already spent there.
 */
export function closeTheGap(
  lines: readonly (Pick<PlanLine, 'key' | 'flexibility' | 'target'> & {
    /** What the period has already spent there, which no cut can free. */
    spent?: number
  })[],
  usual: readonly LineBaseline[],
  gap: number,
  maxCut: number,
): GapPlan {
  if (gap <= 0) return { cuts: [], freed: 0, short: 0 }
  const byKey = new Map(usual.map((line) => [line.key, line]))
  const candidates = lines
    .filter((line) => line.flexibility === 'flexible' && line.target > 0)
    .flatMap((line) => {
      const history = byKey.get(line.key)
      if (!history) return []
      // BUD-35: never below the proven level, nor below what is already spent.
      const floor = Math.max(history.proven, line.spent ?? 0)
      return [{ line, history, room: Math.max(0, line.target - floor) }]
    })
    .filter((item) => item.room > 0)
    .map((item) => ({
      ...item,
      score:
        item.room *
        (1 + Math.max(0, item.history.trend ?? 0) + item.history.variability) *
        (1 + item.history.share),
    }))
    .sort((a, b) => b.score - a.score || a.line.key.localeCompare(b.line.key))

  const cuts: SuggestedCut[] = []
  let left = gap
  for (const { line, history, room } of candidates) {
    if (left <= 0) break
    const steps = Math.max(1, Math.ceil(left / line.target / 0.05 - 1e-9))
    const share = Math.min(maxCut, steps * 0.05)
    const cut = Math.min(Math.round(line.target * share), room)
    if (cut <= 0) continue
    const newTarget = line.target - cut
    cuts.push({
      line: line.key,
      cut,
      share: cut / line.target,
      newTarget,
      lastTime: lastTimeAtMost(history, newTarget),
    })
    left -= cut
  }
  const freed = cuts.reduce((sum, item) => sum + item.cut, 0)
  return { cuts, freed, short: Math.max(0, gap - freed) }
}

/** BUD-34, BUD-35: the latest month counted that a line spent no more than `target`, one-offs aside. */
export function lastTimeAtMost(
  line: Pick<LineBaseline, 'months'>,
  target: number,
): { period: Period; spent: number } | null {
  const ordinary = (month: LineBaseline['months'][number]) => month.spent - month.oneOff
  const last = [...line.months]
    .reverse()
    .find((month) => !month.excluded && ordinary(month) <= target)
  return last ? { period: last.period, spent: ordinary(last) } : null
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
