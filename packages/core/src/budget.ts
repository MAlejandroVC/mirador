import {
  type AnalysisEntry,
  type AnalysisView,
  elapsedDays,
  firstDays,
  lookbackPeriods,
  median,
  mean,
  periodDays,
  spentIn,
} from './analysis.ts'
import type { Category, Flexibility } from './categories.ts'
import { daysBetween, type Period, shiftPeriod } from './dates.ts'

// Epic 6: the budget. Pure functions over the analysis entries (transactions as the
// budget counts them, in the default currency); the caller passes "today". A budget
// period is a month that starts on the person's chosen day (SYS-02).

/** SYS-09: the budget's defaults, which the person can change in Settings › Budget. */
export interface BudgetSettings {
  /** SYS-02: the day of the month budget months start on. */
  startDay: number
  /** BUD-01: how many complete months the usual month is the median of. */
  lookback: 3 | 6 | 12
  /** BUD-35: the largest cut a what-if suggests per category per step, as a share. */
  maxCut: number
  /** BUD-43: how far over target a category may be heading before it is at risk. */
  atRisk: number
}

export const defaultBudgetSettings: BudgetSettings = {
  startDay: 1,
  lookback: 6,
  maxCut: 0.15,
  atRisk: 0.1,
}

/** BUD-08: a plan line is a category, or one tag inside it. */
export interface TagLine {
  categoryId: string
  tagId: string
}

/** The key of a plan line: the category's id, then "~" and the tag's for a tag line. */
export function lineKey(categoryId: string, tagId?: string | null): string {
  return tagId ? `${categoryId}~${tagId}` : categoryId
}

export function parseLineKey(key: string): { categoryId: string; tagId: string | null } {
  const [categoryId = '', tagId] = key.split('~')
  return { categoryId, tagId: tagId ?? null }
}

/**
 * BUD-08: which line an entry counts under. A tag line takes its category's entries
 * that carry its tag; the category's own line takes the rest, so nothing counts twice.
 */
export function lineOf(entry: AnalysisEntry, tagLines: readonly TagLine[]): string | null {
  if (entry.categoryId === null) return null
  for (const line of tagLines)
    if (line.categoryId === entry.categoryId && entry.tagIds.includes(line.tagId))
      return lineKey(line.categoryId, line.tagId)
  return entry.categoryId
}

/** BUD-03: what the person left out of the usual month. */
export interface Exclusions {
  /** Whole months, by their first day. */
  periods: readonly string[]
  /** One line's month: a one-off month for that category only. */
  linePeriods: readonly { line: string; start: string }[]
  /** One-off transactions. */
  transactionIds: readonly string[]
}

export const noExclusions: Exclusions = { periods: [], linePeriods: [], transactionIds: [] }

/** One month of a line's history, as the usual month counts it. */
export interface LineMonth {
  period: Period
  spent: number
  /** BUD-03: left out of the usual month. */
  excluded: boolean
}

/** BUD-01, BUD-02, BUD-07: a line's usual month and the numbers behind it. */
export interface LineBaseline {
  key: string
  categoryId: string
  tagId: string | null
  /** The usual month: the median, or the total spread evenly for an irregular cost. */
  baseline: number
  /** BUD-02: spread evenly because it was spent in fewer than half the months. */
  spread: boolean
  median: number
  /** BUD-07: the proven level, the lowest month counted. */
  proven: number
  provenPeriod: Period | null
  highest: number
  highestPeriod: Period | null
  /** BUD-07: the last half of the months against the first half; null without both. */
  trend: number | null
  /** Its part of all usual spending, 0 to 1. */
  share: number
  /** BUD-34: the usual purchase, for "about 1 fewer a month". */
  averageTicket: number
  /** BUD-34: purchases in a counted month; below 1 for something bought every few months. */
  purchasesPerMonth: number
  /** How much it moves from month to month: the standard deviation over the mean. */
  variability: number
  months: LineMonth[]
}

export interface Baseline {
  /** The complete months it looks back on, oldest first, excluded ones included. */
  periods: Period[]
  /** The months that count: those not left out. */
  counted: Period[]
  lines: LineBaseline[]
  total: number
  /** BUD-05: the median income of the months counted; null without any. */
  income: number | null
}

/**
 * BUD-01, BUD-02, BUD-03, BUD-05, BUD-07: the usual month of every expense line, from
 * the last `lookback` complete months before the one viewed. Months and transactions
 * left out don't count. A line spent in fewer than half of the months is spread
 * evenly (its total over the months), so a yearly bill becomes a monthly amount.
 */
export function baseline(
  entries: readonly AnalysisEntry[],
  view: AnalysisView,
  options: {
    lookback?: number
    exclusions?: Exclusions
    tagLines?: readonly TagLine[]
  } = {},
): Baseline {
  const exclusions = options.exclusions ?? noExclusions
  const tagLines = options.tagLines ?? []
  const periods = lookbackPeriods(view, options.lookback ?? 6)
  const counted = periods.filter((period) => !exclusions.periods.includes(period.start))
  const leftOut = new Set(exclusions.transactionIds)
  const kept = entries.filter((entry) => !leftOut.has(entry.transactionId))

  // What each line spent, and how many purchases, in each month.
  const tallies = new Map<string, { spent: number[]; bought: number[]; count: number[] }>()
  periods.forEach((period, index) => {
    for (const entry of kept) {
      if (entry.date < period.start || entry.date > period.end) continue
      const key = lineOf(entry, tagLines)
      if (key === null || entry.spent === 0) continue
      let tally = tallies.get(key)
      if (!tally) {
        tally = {
          spent: periods.map(() => 0),
          bought: periods.map(() => 0),
          count: periods.map(() => 0),
        }
        tallies.set(key, tally)
      }
      tally.spent[index] = (tally.spent[index] ?? 0) + entry.spent
      if (entry.spent > 0) {
        tally.bought[index] = (tally.bought[index] ?? 0) + entry.spent
        tally.count[index] = (tally.count[index] ?? 0) + 1
      }
    }
  })
  // Tag lines without spending still get a line, at zero.
  for (const line of tagLines) {
    const key = lineKey(line.categoryId, line.tagId)
    if (!tallies.has(key))
      tallies.set(key, {
        spent: periods.map(() => 0),
        bought: periods.map(() => 0),
        count: periods.map(() => 0),
      })
  }

  const lines: LineBaseline[] = []
  for (const [key, tally] of tallies) {
    const months: LineMonth[] = periods.map((period, index) => ({
      period,
      spent: tally.spent[index] ?? 0,
      excluded:
        exclusions.periods.includes(period.start) ||
        exclusions.linePeriods.some((item) => item.line === key && item.start === period.start),
    }))
    const included = months.filter((month) => !month.excluded)
    const values = included.map((month) => month.spent)
    const middle = median(values) ?? 0
    const total = values.reduce((sum, value) => sum + value, 0)
    const active = values.filter((value) => value > 0).length
    // BUD-02: a cost that comes now and then is spread over every month.
    const spread = values.length > 0 && active > 0 && active < values.length / 2
    const usual = Math.max(0, spread ? Math.round(total / values.length) : middle)
    const lowest = included.reduce<LineMonth | null>(
      (low, month) => (low === null || month.spent < low.spent ? month : low),
      null,
    )
    const highest = included.reduce<LineMonth | null>(
      (high, month) => (high === null || month.spent > high.spent ? month : high),
      null,
    )
    const half = Math.floor(values.length / 2)
    const earlier = half > 0 ? mean(values.slice(0, half)) : null
    const later = half > 0 ? mean(values.slice(-half)) : null
    const average = values.length > 0 ? total / values.length : 0
    const deviation =
      values.length > 0
        ? Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length)
        : 0
    const bought = included.reduce(
      (sum, month) => sum + (tally.bought[periods.indexOf(month.period)] ?? 0),
      0,
    )
    const purchases = included.reduce(
      (sum, month) => sum + (tally.count[periods.indexOf(month.period)] ?? 0),
      0,
    )
    const { categoryId, tagId } = parseLineKey(key)
    lines.push({
      key,
      categoryId,
      tagId,
      baseline: usual,
      spread,
      median: middle,
      proven: Math.max(0, lowest?.spent ?? 0),
      provenPeriod: lowest?.period ?? null,
      highest: highest?.spent ?? 0,
      highestPeriod: highest?.period ?? null,
      trend: earlier !== null && later !== null && earlier > 0 ? (later - earlier) / earlier : null,
      share: 0,
      averageTicket: purchases > 0 ? Math.round(bought / purchases) : 0,
      purchasesPerMonth: included.length > 0 ? purchases / included.length : 0,
      variability: average > 0 ? deviation / average : 0,
      months,
    })
  }
  const totalUsual = lines.reduce((sum, line) => sum + line.baseline, 0)
  for (const line of lines) line.share = totalUsual > 0 ? line.baseline / totalUsual : 0
  lines.sort((a, b) => b.baseline - a.baseline || a.key.localeCompare(b.key))

  const incomes = counted.map((period) =>
    kept
      .filter((entry) => entry.date >= period.start && entry.date <= period.end)
      .reduce((sum, entry) => sum + entry.earned, 0),
  )
  return { periods, counted, lines, total: totalUsual, income: median(incomes) }
}

/** BUD-37: a change that a what-if made part of the plan, from a month on. */
export interface Adjustment {
  line: string
  /** The full change to the line's target per month: negative for a cut. */
  change: number
  /** BUD-37: reached over this many months, a step each; 1 for at once. */
  steps: number
  /** The first month it applies to, by its first day. */
  from: string
}

/** What the person set in the plan, kept in its encrypted record. */
export interface PlanSettings {
  /** BUD-04, BUD-55: targets set by hand or kept at a month's close; the rest follow the usual month. */
  targets: readonly { line: string; amount: number; byHand?: boolean }[]
  /** BUD-05: the income the person expects every month, in place of the usual one. */
  income?: number
  /** BUD-05: the income expected in one month only. */
  incomeByPeriod?: readonly { start: string; amount: number }[]
  adjustments: readonly Adjustment[]
  exclusions: Exclusions
  tagLines: readonly TagLine[]
  /** BUD-06: rough amounts entered before there is a month of history; real ones replace them. */
  estimates?: readonly { line: string; amount: number }[]
}

export const emptyPlan: PlanSettings = {
  targets: [],
  adjustments: [],
  exclusions: noExclusions,
  tagLines: [],
}

/** BUD-37: how much of an adjustment applies in the month starting `start`. */
export function adjustmentIn(adjustment: Adjustment, start: string, monthStart: number): number {
  if (start < adjustment.from) return 0
  let months = 0
  let cursor = adjustment.from
  while (cursor < start && months < adjustment.steps) {
    cursor = shiftPeriod(cursor, 'month', 1, 0, monthStart).start
    months += 1
  }
  const step = Math.min(adjustment.steps, months + 1)
  return Math.round((adjustment.change * step) / Math.max(1, adjustment.steps))
}

/** BUD-43: how a line is doing this month. */
export type LineStatus = 'onTrack' | 'atRisk' | 'over'

/** BUD-40, BUD-41: one line of the plan in the month viewed. */
export interface PlanLine {
  key: string
  categoryId: string
  tagId: string | null
  flexibility: Flexibility
  groupId: string
  /** The target before this month's adjustment and carry-over. */
  base: number
  target: number
  /** BUD-04: set by hand rather than following the usual month. */
  byHand: boolean
  adjustment: number
  /** BUD-52: carried over from last month's close. */
  carry: number
  spent: number
  /** Target minus spent: negative when over. */
  left: number
  /** BUD-42: where it is heading by the month's end, along its usual curve. */
  projected: number
  status: LineStatus
  /** The last day it was spent on this month. */
  lastDate: string | null
  usual: LineBaseline | null
}

export interface PlanMonth {
  period: Period
  lines: PlanLine[]
  target: number
  spent: number
  left: number
  projected: number
  /** BUD-43 for the whole plan. */
  status: LineStatus
  /** BUD-05: the income expected this month, and whether the person set it. */
  income: number
  incomeSet: boolean
  /** BUD-12: expected income minus every target. */
  leftOver: number
  /** Income so far this month. */
  earned: number
}

/**
 * BUD-42: how much of a month's spending usually happens by day `days`, the median
 * share over the months counted; the share of days gone when there is no history.
 */
export function usualShare(
  entries: readonly AnalysisEntry[],
  counted: readonly Period[],
  days: number,
  length: number,
  select: (entry: AnalysisEntry) => boolean,
): number {
  const shares: number[] = []
  for (const period of counted) {
    const total = spentIn(entries, period, select)
    if (total <= 0) continue
    shares.push(Math.min(1, Math.max(0, spentIn(entries, firstDays(period, days), select) / total)))
  }
  if (shares.length === 0) return Math.min(1, days / length)
  const sorted = [...shares].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

/**
 * BUD-40 to BUD-44: the plan for the month viewed. Each line's target is its kept or
 * hand-set target, else its usual month, plus this month's adjustment and anything
 * carried over. Spending counts only what the budget counts: the caller leaves out
 * transfers and transactions left out of the budget (BUD-44).
 */
export function planMonth(
  entries: readonly AnalysisEntry[],
  view: AnalysisView,
  categories: readonly Category[],
  plan: PlanSettings,
  settings: BudgetSettings,
  carry: readonly { line: string; amount: number }[] = [],
): { month: PlanMonth; baseline: Baseline } {
  // BUD-44: what the person left out of the budget never counts here.
  entries = entries.filter((entry) => !entry.excluded)
  const usual = baseline(entries, view, {
    lookback: settings.lookback,
    exclusions: plan.exclusions,
    tagLines: plan.tagLines,
  })
  const byKey = new Map(usual.lines.map((line) => [line.key, line]))
  const byId = new Map(categories.map((category) => [category.id, category]))
  const period = view.period
  const days = elapsedDays(period, view.today)
  const length = periodDays(period)
  const going = view.today >= period.start && view.today <= period.end

  // Every line with a usual month, a target, an adjustment or spending this month.
  const keys = new Set<string>(usual.lines.map((line) => line.key))
  for (const target of plan.targets) keys.add(target.line)
  for (const adjustment of plan.adjustments) keys.add(adjustment.line)
  for (const item of carry) keys.add(item.line)
  for (const item of plan.estimates ?? []) keys.add(item.line)
  for (const entry of entries)
    if (entry.date >= period.start && entry.date <= period.end && entry.spent > 0) {
      const key = lineOf(entry, plan.tagLines)
      if (key !== null) keys.add(key)
    }

  const lines: PlanLine[] = []
  for (const key of keys) {
    const { categoryId, tagId } = parseLineKey(key)
    const category = byId.get(categoryId)
    if (!category || category.kind === 'income') continue
    const select = (entry: AnalysisEntry) => lineOf(entry, plan.tagLines) === key
    const line = byKey.get(key) ?? null
    const set = plan.targets.find((target) => target.line === key)
    // BUD-06: an estimate stands in only for a line with no month of its own yet.
    const estimate = plan.estimates?.find((item) => item.line === key)?.amount
    const lived = line?.months.some((month) => month.spent !== 0) === true
    const base = set?.amount ?? (line && lived ? line.baseline : (estimate ?? line?.baseline ?? 0))
    const adjustment = plan.adjustments
      .filter((item) => item.line === key)
      .reduce((sum, item) => sum + adjustmentIn(item, period.start, settings.startDay), 0)
    const carried = carry
      .filter((item) => item.line === key)
      .reduce((sum, item) => sum + item.amount, 0)
    const target = Math.max(0, base + adjustment + carried)
    let spent = 0
    let lastDate: string | null = null
    for (const entry of entries)
      if (entry.date >= period.start && entry.date <= period.end && select(entry)) {
        spent += entry.spent
        if (entry.spent > 0 && (lastDate === null || entry.date > lastDate)) lastDate = entry.date
      }
    const share = going ? usualShare(entries, usual.counted, days, length, select) : 1
    const projected = going
      ? spent + Math.max(0, Math.round((line?.baseline ?? base) * (1 - share)))
      : spent
    const status: LineStatus =
      spent > target
        ? 'over'
        : going && projected > target * (1 + settings.atRisk) && projected > target
          ? 'atRisk'
          : 'onTrack'
    lines.push({
      key,
      categoryId,
      tagId,
      flexibility: category.flexibility,
      groupId: category.groupId,
      base,
      target,
      byHand: set?.byHand === true,
      adjustment,
      carry: carried,
      spent,
      left: target - spent,
      projected,
      status,
      lastDate,
      usual: line,
    })
  }
  // Drop lines with nothing planned and nothing spent, such as a category used long ago.
  const shown = lines
    .filter((line) => line.target > 0 || line.spent !== 0)
    .sort((a, b) => b.target - a.target || b.spent - a.spent || a.key.localeCompare(b.key))

  const target = shown.reduce((sum, line) => sum + line.target, 0)
  const spent = shown.reduce((sum, line) => sum + line.spent, 0)
  const projected = shown.reduce((sum, line) => sum + Math.max(line.projected, 0), 0)
  const set =
    plan.incomeByPeriod?.find((item) => item.start === period.start)?.amount ?? plan.income
  const income = set ?? usual.income ?? 0
  const earned = entries
    .filter((entry) => entry.date >= period.start && entry.date <= period.end)
    .reduce((sum, entry) => sum + entry.earned, 0)
  return {
    baseline: usual,
    month: {
      period,
      lines: shown,
      target,
      spent,
      left: target - spent,
      projected,
      status:
        spent > target
          ? 'over'
          : going && projected > target * (1 + settings.atRisk)
            ? 'atRisk'
            : 'onTrack',
      income,
      incomeSet: set !== undefined,
      leftOver: income - target,
      earned,
    },
  }
}

/** BUD-13: the plan split into commitments, needs and wants. */
export function planSplit(lines: readonly PlanLine[]): Record<Flexibility, number> {
  const split: Record<Flexibility, number> = { locked: 0, fixed: 0, flexible: 0 }
  for (const line of lines) split[line.flexibility] += line.target
  return split
}

/** Days from `today` to the period's last day, today included. */
export function daysLeft(period: Period, today: string): number {
  if (today > period.end) return 0
  if (today < period.start) return periodDays(period)
  return daysBetween(today, period.end) + 1
}
