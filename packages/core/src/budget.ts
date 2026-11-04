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
import { daysBetween, type Period } from './dates.ts'
import type { CommittedItem } from './outlook.ts'

// Epic 6: the budget. Pure functions over the analysis entries (transactions as the
// budget counts them, in the default currency); the caller passes "today". A budget
// period is a month that starts on the person's chosen day (SYS-02).

/** SYS-09: the budget's defaults, which the person can change in Settings › Budget. */
export interface BudgetSettings {
  /** SYS-02: the day of the month budget months start on. */
  startDay: number
  /** BUD-01: how many complete months the starting amounts are the average of. */
  lookback: 3 | 6 | 12
  /** BUD-35: the largest cut Find money suggests per category, as a share of its target. */
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
export function lineOf(
  entry: Pick<AnalysisEntry, 'categoryId' | 'tagIds'>,
  tagLines: readonly TagLine[],
): string | null {
  if (entry.categoryId === null) return null
  for (const line of tagLines)
    if (line.categoryId === entry.categoryId && entry.tagIds.includes(line.tagId))
      return lineKey(line.categoryId, line.tagId)
  return entry.categoryId
}

/** BUD-03: what the person left out of the starting amounts by hand. */
export interface Exclusions {
  /** Whole months, by their first day. */
  periods: readonly string[]
  /** One line's month: a one-off month for that category only. */
  linePeriods: readonly { line: string; start: string }[]
  /** One-off transactions. */
  transactionIds: readonly string[]
  /** BUD-76: one-offs the app found that the person chose to count after all. */
  counted?: readonly string[]
}

export const noExclusions: Exclusions = { periods: [], linePeriods: [], transactionIds: [] }

/** BUD-02: how many times a line's usual purchase a one-off is bigger than. */
export const oneOffFactor = 3

/** BUD-02: a purchase left out of the starting amount because it is out of the ordinary. */
export interface OneOff {
  transactionId: string
  line: string
  date: string
  amount: number
  /** Over 3 times the line's usual purchase, or its only purchase in the months looked at. */
  reason: 'large' | 'only'
  /** The line's usual purchase, the middle one; 0 for an only purchase. */
  usual: number
  /** BUD-76: counted in the starting amount after all. */
  counted: boolean
}

/**
 * BUD-02: the purchases out of the ordinary in each line: more than 3 times the line's
 * usual purchase (the middle one, once there are at least 3), or its only purchase in
 * the months looked at. A purchase from a recurring transaction never is: it is how
 * the line usually goes, such as a yearly bill.
 */
export function findOneOffs(
  entries: readonly AnalysisEntry[],
  months: readonly Period[],
  tagLines: readonly TagLine[],
  counted: ReadonlySet<string> = new Set(),
): OneOff[] {
  const byLine = new Map<string, AnalysisEntry[]>()
  for (const entry of entries) {
    if (entry.spent <= 0) continue
    if (!months.some((period) => entry.date >= period.start && entry.date <= period.end)) continue
    const key = lineOf(entry, tagLines)
    if (key === null) continue
    const list = byLine.get(key) ?? []
    list.push(entry)
    byLine.set(key, list)
  }
  const found: OneOff[] = []
  for (const [key, purchases] of byLine) {
    const add = (entry: AnalysisEntry, reason: OneOff['reason'], usual: number) => {
      found.push({
        transactionId: entry.transactionId,
        line: key,
        date: entry.date,
        amount: entry.spent,
        reason,
        usual,
        counted: counted.has(entry.transactionId),
      })
    }
    const only = purchases[0]
    if (purchases.length === 1 && only?.recurringId === null) add(only, 'only', 0)
    if (purchases.length < 3) continue
    const usual = median(purchases.map((entry) => entry.spent)) ?? 0
    for (const entry of purchases)
      if (entry.recurringId === null && entry.spent > usual * oneOffFactor)
        add(entry, 'large', usual)
  }
  return found.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount)
}

/** One month of a line's history, as the starting amount counts it. */
export interface LineMonth {
  period: Period
  /** Everything spent, one-offs included. */
  spent: number
  /** BUD-02: what its one-offs came to, which the starting amount leaves out. */
  oneOff: number
  /** BUD-03: left out of the starting amount. */
  excluded: boolean
}

/** BUD-01, BUD-02, BUD-07: a line's starting amount and the numbers behind it. */
export interface LineBaseline {
  key: string
  categoryId: string
  tagId: string | null
  /** BUD-01: the starting amount, the average month without one-offs. */
  baseline: number
  /** BUD-02: the average with its one-offs counted. */
  withOneOffs: number
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
  /** BUD-02, BUD-76: the one-offs found, those counted after all included. */
  oneOffs: OneOff[]
}

/**
 * BUD-01, BUD-02, BUD-03, BUD-05, BUD-07: the starting amount of every expense line,
 * from the last `lookback` complete months before the one viewed: its average month
 * with one-offs left out. Months and transactions left out by hand don't count at all;
 * a one-off still shows in its own month, it just doesn't raise the starting amount.
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
  const oneOffs = findOneOffs(kept, counted, tagLines, new Set(exclusions.counted ?? []))
  const unusual = new Set(oneOffs.filter((item) => !item.counted).map((item) => item.transactionId))

  // What each line spent, what its one-offs came to, and its ordinary purchases, each month.
  const zeros = () => periods.map(() => 0)
  const tallies = new Map<
    string,
    { spent: number[]; oneOff: number[]; bought: number[]; count: number[] }
  >()
  periods.forEach((period, index) => {
    for (const entry of kept) {
      if (entry.date < period.start || entry.date > period.end) continue
      const key = lineOf(entry, tagLines)
      if (key === null || entry.spent === 0) continue
      let tally = tallies.get(key)
      if (!tally) {
        tally = { spent: zeros(), oneOff: zeros(), bought: zeros(), count: zeros() }
        tallies.set(key, tally)
      }
      tally.spent[index] = (tally.spent[index] ?? 0) + entry.spent
      if (unusual.has(entry.transactionId))
        tally.oneOff[index] = (tally.oneOff[index] ?? 0) + entry.spent
      else if (entry.spent > 0) {
        tally.bought[index] = (tally.bought[index] ?? 0) + entry.spent
        tally.count[index] = (tally.count[index] ?? 0) + 1
      }
    }
  })
  // Tag lines without spending still get a line, at zero.
  for (const line of tagLines) {
    const key = lineKey(line.categoryId, line.tagId)
    if (!tallies.has(key))
      tallies.set(key, { spent: zeros(), oneOff: zeros(), bought: zeros(), count: zeros() })
  }

  const lines: LineBaseline[] = []
  for (const [key, tally] of tallies) {
    const months: LineMonth[] = periods.map((period, index) => ({
      period,
      spent: tally.spent[index] ?? 0,
      oneOff: tally.oneOff[index] ?? 0,
      excluded:
        exclusions.periods.includes(period.start) ||
        exclusions.linePeriods.some((item) => item.line === key && item.start === period.start),
    }))
    const included = months.filter((month) => !month.excluded)
    // BUD-02: the usual numbers are those of ordinary spending, one-offs taken out.
    const ordinary = (month: LineMonth) => month.spent - month.oneOff
    const values = included.map(ordinary)
    const total = values.reduce((sum, value) => sum + value, 0)
    const average = values.length > 0 ? total / values.length : 0
    const all = included.reduce((sum, month) => sum + month.spent, 0)
    const lowest = included.reduce<LineMonth | null>(
      (low, month) => (low === null || ordinary(month) < ordinary(low) ? month : low),
      null,
    )
    const highest = included.reduce<LineMonth | null>(
      (high, month) => (high === null || ordinary(month) > ordinary(high) ? month : high),
      null,
    )
    const half = Math.floor(values.length / 2)
    const earlier = half > 0 ? mean(values.slice(0, half)) : null
    const later = half > 0 ? mean(values.slice(-half)) : null
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
      baseline: Math.max(0, Math.round(average)),
      withOneOffs: Math.max(0, values.length > 0 ? Math.round(all / values.length) : 0),
      median: median(values) ?? 0,
      proven: Math.max(0, lowest ? ordinary(lowest) : 0),
      provenPeriod: lowest?.period ?? null,
      highest: highest ? ordinary(highest) : 0,
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
  return { periods, counted, lines, total: totalUsual, income: median(incomes), oneOffs }
}

/**
 * BUD-77: how many of a line's recent months a target would have been enough for, as
 * its columns show them: everything spent, one-offs too; months left out don't count.
 */
export function coverage(
  line: Pick<LineBaseline, 'months'>,
  target: number,
): { covered: number; months: number } {
  const counted = line.months.filter((month) => !month.excluded)
  return {
    covered: counted.filter((month) => month.spent <= target).length,
    months: counted.length,
  }
}

/**
 * BUD-77: what is already committed to one line in a period: the installment parts and
 * recurring expenses still to come there (ANA-27), each counted on the line its category
 * and tags put it on (BUD-08).
 */
export function committedTo(
  items: readonly CommittedItem[],
  period: Period,
  line: string,
  tagLines: readonly TagLine[],
): { amount: number; count: number } {
  const mine = items.filter(
    (item) =>
      item.date >= period.start && item.date <= period.end && lineOf(item, tagLines) === line,
  )
  return { amount: mine.reduce((sum, item) => sum + item.amount, 0), count: mine.length }
}

/** How the budget counts, kept in the person's encrypted plan record. */
export interface PlanSettings {
  exclusions: Exclusions
  tagLines: readonly TagLine[]
  /** BUD-06: rough amounts entered before there is a month of history; real ones replace them. */
  estimates?: readonly { line: string; amount: number }[]
}

export const emptyPlan: PlanSettings = { exclusions: noExclusions, tagLines: [] }

/**
 * BUD-01, BUD-06, BUD-70: what each line starts from in a new budget: its average month
 * without one-offs, or the rough amount entered while it has no month of its own.
 */
export function startingAmounts(
  usual: Baseline,
  estimates: PlanSettings['estimates'] = [],
): Map<string, number> {
  const amounts = new Map<string, number>()
  for (const item of estimates) amounts.set(item.line, item.amount)
  for (const line of usual.lines)
    if (line.months.some((month) => month.spent !== 0) || !amounts.has(line.key))
      amounts.set(line.key, line.baseline)
  return amounts
}

/** BUD-40, BUD-70: a month's targets and income, from its own budget. */
export interface MonthTargets {
  /** Every line's target; a line not here has none. */
  targets: ReadonlyMap<string, number>
  income: number
}

/** BUD-43: how a line is doing this month. */
export type LineStatus = 'onTrack' | 'atRisk' | 'over'

/** BUD-40, BUD-41: one line of a month's budget. */
export interface PlanLine {
  key: string
  categoryId: string
  tagId: string | null
  flexibility: Flexibility
  groupId: string
  /** The month's own target, before anything carried over. */
  base: number
  target: number
  /** BUD-04: what the line would start from in a new budget. */
  starting: number
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
  /** BUD-43 for the whole budget. */
  status: LineStatus
  /** BUD-05: the income expected this month. */
  income: number
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
 * BUD-40 to BUD-44: a month's budget against what it spent. Each line's target is the
 * month's own, or its starting amount when the month has no budget yet, plus anything
 * carried over. Spending counts only what the budget counts: the caller leaves out
 * transfers and wallets out of the budget, and transactions left out of the budget
 * don't count here (BUD-44). `usual` is the baseline before today, so every month,
 * this one or a later one, starts from the same complete months.
 */
export function planMonth(
  entries: readonly AnalysisEntry[],
  view: AnalysisView,
  categories: readonly Category[],
  usual: Baseline,
  plan: PlanSettings,
  settings: BudgetSettings,
  month: MonthTargets | null,
  options: {
    carry?: readonly { line: string; amount: number }[]
    /** BUD-70: every line there was spending to start from, even at nothing, as when making a budget. */
    all?: boolean
  } = {},
): PlanMonth {
  // BUD-44: what the person left out of the budget never counts here.
  entries = entries.filter((entry) => !entry.excluded)
  const carry = options.carry ?? []
  const byKey = new Map(usual.lines.map((line) => [line.key, line]))
  const byId = new Map(categories.map((category) => [category.id, category]))
  const starting = startingAmounts(usual, plan.estimates)
  const targets = month?.targets ?? starting
  const period = view.period
  const days = elapsedDays(period, view.today)
  const length = periodDays(period)
  const going = view.today >= period.start && view.today <= period.end

  // Every line with a starting amount, a target, a carry-over or spending this month.
  const keys = new Set<string>(starting.keys())
  for (const key of targets.keys()) keys.add(key)
  for (const item of carry) keys.add(item.line)
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
    const base = targets.get(key) ?? 0
    const carried = carry
      .filter((item) => item.line === key)
      .reduce((sum, item) => sum + item.amount, 0)
    const target = Math.max(0, base + carried)
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
      starting: starting.get(key) ?? 0,
      carry: carried,
      spent,
      left: target - spent,
      projected,
      status,
      lastDate,
      usual: line,
    })
  }
  // Drop lines with nothing planned and nothing spent, such as a category used long ago,
  // unless the budget is being made and the line had spending to start from.
  const shown = lines
    .filter(
      (line) =>
        line.target > 0 || line.spent !== 0 || (options.all === true && line.usual !== null),
    )
    .sort((a, b) => b.target - a.target || b.spent - a.spent || a.key.localeCompare(b.key))

  const target = shown.reduce((sum, line) => sum + line.target, 0)
  const spent = shown.reduce((sum, line) => sum + line.spent, 0)
  const projected = shown.reduce((sum, line) => sum + Math.max(line.projected, 0), 0)
  const income = month?.income ?? usual.income ?? 0
  const earned = entries
    .filter((entry) => entry.date >= period.start && entry.date <= period.end)
    .reduce((sum, entry) => sum + entry.earned, 0)
  return {
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
    leftOver: income - target,
    earned,
  }
}

/** BUD-13: a month's budget split into commitments, needs and wants. */
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
