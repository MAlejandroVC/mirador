import { type Category, categoryOf, type Flexibility, systemCategories } from './categories.ts'
import {
  addDays,
  daysBetween,
  inPeriod,
  type Period,
  type PeriodScope,
  shiftPeriod,
} from './dates.ts'
import type { ExchangeRate } from './exchange.ts'
import { spreadInstallments } from './installments.ts'
import { amountIn, flow, type Transaction, type TransactionFields } from './transactions.ts'

// Epic 5: spending analysis. Pure functions over the decrypted records, run in the
// browser; the caller passes everything in, "today" included. Periods are calendar
// months, weeks, quarters or years until the budget's own periods arrive (SYS-02).

/** What turning transactions into analysis entries needs to know. */
export interface AnalysisContext {
  walletCurrency: ReadonlyMap<string, string>
  /** The default currency, which every amount is counted in (SYS-04). */
  currency: string
  rates: readonly ExchangeRate[]
  categories: readonly Category[]
}

/** One expense, income or refund as analysis counts it, in the default currency. */
export interface AnalysisEntry {
  id: string
  /** The transaction to open: for an installment, the purchase. */
  transactionId: string
  date: string
  /** Positive when spent; negative for a refund, which lowers spending (TXN-11). */
  spent: number
  /** Positive money earned; zero for spending and refunds. */
  earned: number
  refund: boolean
  categoryId: string | null
  groupId: string | null
  flexibility: Flexibility | null
  tagIds: readonly string[]
  payeeId: string | null
  walletId: string
  note: string | null
  recurringId: string | null
  installment: boolean
  /** TXN-06: left out of the budget, and of analysis unless the filter adds it (ANA-03). */
  excluded: boolean
}

/**
 * TXN-11: money in is a refund when it takes an expense category (the category of what
 * was refunded) or the Refunds system category. Money in with an income category, or
 * none, is income.
 */
export function isRefund(
  transaction: Pick<TransactionFields, 'kind' | 'amount'>,
  category: Pick<Category, 'kind' | 'systemKey'> | null,
): boolean {
  if (flow(transaction as TransactionFields) !== 'income' || category === null) return false
  return category.kind === 'expense' || category.systemKey === 'refunds'
}

/**
 * The transactions as analysis counts them: an installment purchase one part a month
 * (TXN-32), refunds as negative spending (TXN-11), transfers and balance changes left
 * out (TXN-03), every amount in the default currency at the rate on its date. Amounts
 * in a currency with no rate yet are left out, as in the transaction totals (TXN-24).
 */
export function analysisEntries(
  transactions: readonly Transaction[],
  context: AnalysisContext,
): AnalysisEntry[] {
  const byId = new Map(context.categories.map((category) => [category.id, category]))
  const bySystemKey = systemCategories(context.categories)
  const entries: AnalysisEntry[] = []
  for (const transaction of spreadInstallments(transactions)) {
    const direction = flow(transaction)
    if (direction === null) continue
    const amount = amountIn(transaction, context.walletCurrency, context.currency, context.rates)
    if (amount === null) continue
    const category = categoryOf(transaction, byId, bySystemKey)
    const refund = isRefund(transaction, category)
    entries.push({
      id: transaction.id,
      transactionId: transaction.part?.purchaseId ?? transaction.id,
      date: transaction.date,
      spent: direction === 'expense' || refund ? -amount : 0,
      earned: direction === 'income' && !refund ? amount : 0,
      refund,
      categoryId: category?.id ?? null,
      groupId: category?.groupId ?? null,
      flexibility: category?.flexibility ?? null,
      tagIds: transaction.tagIds ?? [],
      payeeId: transaction.payeeId ?? null,
      walletId: transaction.walletId,
      note: transaction.note ?? null,
      recurringId: transaction.recurringId ?? null,
      installment: transaction.part !== undefined,
      excluded: transaction.excludeFromBudget === true,
    })
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

/** ANA-03: the filters every analysis shares; an empty list means "any". */
export interface AnalysisFilter {
  walletIds?: readonly string[]
  groupIds?: readonly string[]
  categoryIds?: readonly string[]
  tagIds?: readonly string[]
  payeeIds?: readonly string[]
  /** TXN-06: count the transactions left out of the budget too. */
  includeExcluded?: boolean
}

const some = <T>(list: readonly T[] | undefined): list is readonly T[] =>
  list !== undefined && list.length > 0

/** ANA-03: the entries that pass every filter that is on. */
export function filterEntries(
  entries: readonly AnalysisEntry[],
  filter: AnalysisFilter,
): AnalysisEntry[] {
  return entries.filter(
    (entry) =>
      (filter.includeExcluded === true || !entry.excluded) &&
      (!some(filter.walletIds) || filter.walletIds.includes(entry.walletId)) &&
      (!some(filter.groupIds) ||
        (entry.groupId !== null && filter.groupIds.includes(entry.groupId))) &&
      (!some(filter.categoryIds) ||
        (entry.categoryId !== null && filter.categoryIds.includes(entry.categoryId))) &&
      (!some(filter.tagIds) || entry.tagIds.some((tag) => filter.tagIds?.includes(tag))) &&
      (!some(filter.payeeIds) ||
        (entry.payeeId !== null && filter.payeeIds.includes(entry.payeeId))),
  )
}

/** Which slice of the entries a figure counts, such as one category. */
export type Select = (entry: AnalysisEntry) => boolean

const everything: Select = () => true

/** The period being looked at, and what comparing it with earlier ones needs. */
export interface AnalysisView {
  period: Period
  scope: PeriodScope
  /** SYS-03: the first day of the week, 0 for Sunday. */
  firstDay: number
  /** SYS-02: the day budget months start on; 1, the calendar month, when left out. */
  monthStart?: number
  today: string
  /** The first date with any record, so periods before it don't count as zero. */
  firstDate: string | null
}

/** The middle value, the mean of the two middle ones for an even count; null when empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const upper = sorted[middle] ?? 0
  return sorted.length % 2 === 1 ? upper : Math.round(((sorted[middle - 1] ?? 0) + upper) / 2)
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

/** How many days the period has. */
export function periodDays(period: Period): number {
  return daysBetween(period.start, period.end) + 1
}

/** How many of the period's days have passed, today included; all of them once it ended. */
export function elapsedDays(period: Period, today: string): number {
  return Math.max(0, Math.min(periodDays(period), daysBetween(period.start, today) + 1))
}

/** The first `days` days of a period. */
export function firstDays(period: Period, days: number): Period {
  const end = addDays(period.start, days - 1)
  return { start: period.start, end: end < period.end ? end : period.end }
}

/** Whether the period is still going: today falls in it. */
export function inProgress(view: Pick<AnalysisView, 'period' | 'today'>): boolean {
  return inPeriod(view.today, view.period)
}

/**
 * BUD-01: up to `count` complete periods before the one viewed, oldest first, leaving
 * out those before the first record.
 */
export function lookbackPeriods(view: AnalysisView, count = 6): Period[] {
  const periods: Period[] = []
  for (let step = count; step >= 1; step -= 1) {
    const period = shiftPeriod(view.period.start, view.scope, -step, view.firstDay, view.monthStart)
    if (view.firstDate !== null && period.end >= view.firstDate) periods.push(period)
  }
  return periods
}

/** What was spent in `period`, refunds taken off. */
export function spentIn(
  entries: readonly AnalysisEntry[],
  period: Period,
  select: Select = everything,
): number {
  let total = 0
  for (const entry of entries)
    if (entry.date >= period.start && entry.date <= period.end && select(entry))
      total += entry.spent
  return total
}

/** ANA-01: income, spending, left over and savings rate for a period. */
export interface PeriodTotals {
  income: number
  spent: number
  /** Income minus spending. */
  leftOver: number
  /** Left over as a share of income, from 0 to 1 or below; null without income. */
  savingsRate: number | null
}

export function periodTotals(entries: readonly AnalysisEntry[], period: Period): PeriodTotals {
  let income = 0
  let spent = 0
  for (const entry of entries) {
    if (entry.date < period.start || entry.date > period.end) continue
    income += entry.earned
    spent += entry.spent
  }
  const leftOver = income - spent
  return { income, spent, leftOver, savingsRate: income > 0 ? leftOver / income : null }
}

/** How the period compares with the usual one (BUD-01: the median of earlier periods). */
export interface Usual {
  /** Spent in the period viewed: so far, while it is in progress. */
  current: number
  /** The median of the lookback, over the same days when the period is in progress. */
  usual: number | null
  /** What each lookback period spent over those days, oldest first. */
  periods: { period: Period; spent: number }[]
}

/**
 * BUD-01, ANA-12, ANA-30: the period viewed against the usual period. While it is in
 * progress, each earlier period counts only its first as many days, so the middle of
 * a month is never compared with a whole one.
 */
export function usualSpending(
  entries: readonly AnalysisEntry[],
  view: AnalysisView,
  select: Select = everything,
  count = 6,
): Usual {
  const days = elapsedDays(view.period, view.today)
  const going = inProgress(view)
  const periods = lookbackPeriods(view, count).map((period) => ({
    period,
    spent: spentIn(entries, going ? firstDays(period, days) : period, select),
  }))
  return {
    current: spentIn(entries, going ? firstDays(view.period, days) : view.period, select),
    usual: median(periods.map((item) => item.spent)),
    periods,
  }
}

/** ANA-12: the previous period and the trailing 3, 6 and 12-period averages. */
export interface Comparison {
  current: number
  previous: number | null
  average3: number | null
  average6: number | null
  average12: number | null
}

export function compareSpending(
  entries: readonly AnalysisEntry[],
  view: AnalysisView,
  select: Select = everything,
): Comparison {
  const { current, periods } = usualSpending(entries, view, select, 12)
  const spent = periods.map((item) => item.spent)
  return {
    current,
    previous: spent.at(-1) ?? null,
    average3: mean(spent.slice(-3)),
    average6: mean(spent.slice(-6)),
    average12: mean(spent),
  }
}

/** The change from `before` to `after` as a share of `before`; null when it was zero. */
export function change(after: number, before: number | null): number | null {
  if (before === null || before <= 0) return null
  return (after - before) / before
}

/**
 * ANA-21: spending added up day by day through the period, and the usual period's curve
 * (the median, day by day, of the lookback's curves). Today's curve stops at today.
 */
export interface Pace {
  days: number
  /** One value per day so far. */
  current: number[]
  /** One value per day of the period. */
  usual: number[]
}

export function cumulative(
  entries: readonly AnalysisEntry[],
  period: Period,
  select: Select = everything,
): number[] {
  const daily = Array.from({ length: periodDays(period) }, () => 0)
  for (const entry of entries) {
    if (entry.date < period.start || entry.date > period.end || !select(entry)) continue
    const index = daysBetween(period.start, entry.date)
    daily[index] = (daily[index] ?? 0) + entry.spent
  }
  let total = 0
  return daily.map((amount) => (total += amount))
}

export function pace(
  entries: readonly AnalysisEntry[],
  view: AnalysisView,
  select: Select = everything,
  count = 6,
): Pace {
  const days = periodDays(view.period)
  const curves = lookbackPeriods(view, count).map((period) => cumulative(entries, period, select))
  const usual = Array.from(
    { length: days },
    (_, day) => median(curves.map((curve) => curve[Math.min(day, curve.length - 1)] ?? 0)) ?? 0,
  )
  const current = cumulative(entries, view.period, select).slice(
    0,
    elapsedDays(view.period, view.today),
  )
  return { days, current, usual: curves.length > 0 ? usual : [] }
}

/**
 * BUD-41, BUD-42: where spending would stand at the end of each day to finish the period
 * on `target`, following the usual curve's shape; an even line when there is no usual
 * curve to follow.
 */
export function budgetPace(target: number, usual: readonly number[], days: number): number[] {
  const end = usual[days - 1] ?? 0
  return Array.from({ length: days }, (_, day) =>
    Math.round(end > 0 ? (target * (usual[day] ?? end)) / end : (target * (day + 1)) / days),
  )
}

/** One slice of spending: a category group, category, tag, payee or wallet. */
export interface Slice {
  key: string
  spent: number
  /** Its part of all the spending, from 0 to 1. */
  share: number
  /** ANA-23: the expenses behind it, refunds not counted, and their average. */
  count: number
  average: number
}

export type SliceBy = 'group' | 'category' | 'tag' | 'payee' | 'wallet'

function keysOf(entry: AnalysisEntry, by: SliceBy): readonly string[] {
  switch (by) {
    case 'group':
      return entry.groupId === null ? [] : [entry.groupId]
    case 'category':
      return entry.categoryId === null ? [] : [entry.categoryId]
    case 'tag':
      return entry.tagIds
    case 'payee':
      return entry.payeeId === null ? [] : [entry.payeeId]
    case 'wallet':
      return [entry.walletId]
  }
}

/**
 * ANA-10, ANA-14, ANA-17, ANA-23: spending in a period split by group, category, tag,
 * payee or wallet, largest first, with each one's share, count and average ticket. A
 * transaction with two tags counts under both, so tag shares can add up to more than
 * the whole. Slices that a refund brought to zero or below are left out.
 */
export function breakdown(
  entries: readonly AnalysisEntry[],
  period: Period,
  by: SliceBy,
  select: Select = everything,
): Slice[] {
  const slices = new Map<string, { spent: number; count: number; bought: number }>()
  let total = 0
  for (const entry of entries) {
    if (entry.date < period.start || entry.date > period.end || !select(entry)) continue
    if (entry.spent === 0) continue
    total += entry.spent
    for (const key of keysOf(entry, by)) {
      const slice = slices.get(key) ?? { spent: 0, count: 0, bought: 0 }
      slice.spent += entry.spent
      if (entry.spent > 0) {
        slice.count += 1
        slice.bought += entry.spent
      }
      slices.set(key, slice)
    }
  }
  return [...slices.entries()]
    .filter(([, slice]) => slice.spent > 0)
    .map(([key, slice]) => ({
      key,
      spent: slice.spent,
      share: total > 0 ? slice.spent / total : 0,
      count: slice.count,
      average: slice.count > 0 ? Math.round(slice.bought / slice.count) : 0,
    }))
    .sort((a, b) => b.spent - a.spent || a.key.localeCompare(b.key))
}

/** ANA-13: spending split by category flexibility. */
export function flexibilitySplit(
  entries: readonly AnalysisEntry[],
  period: Period,
): Record<Flexibility, number> {
  const split: Record<Flexibility, number> = { locked: 0, fixed: 0, flexible: 0 }
  for (const entry of entries)
    if (entry.date >= period.start && entry.date <= period.end && entry.flexibility !== null)
      split[entry.flexibility] += entry.spent
  return split
}

/** ANA-11, ANA-18: what a slice spent in each of the last periods, with the count. */
export interface PeriodPoint {
  period: Period
  spent: number
  count: number
}

/** ANA-11: spending per period for the `count` periods up to the one viewed, oldest first. */
export function spendingSeries(
  entries: readonly AnalysisEntry[],
  view: AnalysisView,
  select: Select = everything,
  count = 12,
): PeriodPoint[] {
  const points: PeriodPoint[] = []
  for (let step = count - 1; step >= 0; step -= 1) {
    const period = shiftPeriod(view.period.start, view.scope, -step, view.firstDay, view.monthStart)
    if (view.firstDate !== null && period.end < view.firstDate) continue
    let spent = 0
    let bought = 0
    for (const entry of entries) {
      if (entry.date < period.start || entry.date > period.end || !select(entry)) continue
      spent += entry.spent
      if (entry.spent > 0) bought += 1
    }
    points.push({ period, spent, count: bought })
  }
  return points
}

/** ANA-26: a difference split into buying more or less often and paying more or less each time. */
export interface ChangeSplit {
  difference: number
  /** From the number of expenses. */
  frequency: number
  /** From the average ticket: the rest of the difference. */
  price: number
}

/**
 * ANA-26: how much of the change from `before` to `after` comes from the number of
 * expenses, valued at the earlier average ticket, and how much from the ticket itself.
 */
export function splitChange(
  before: { spent: number; count: number },
  after: { spent: number; count: number },
): ChangeSplit {
  const difference = after.spent - before.spent
  const ticket = before.count > 0 ? before.spent / before.count : 0
  const frequency = before.count > 0 ? Math.round((after.count - before.count) * ticket) : 0
  return { difference, frequency, price: difference - frequency }
}

/** ANA-12, ANA-26, ANA-30: one category's change against its usual period. */
export interface CategoryChange extends ChangeSplit {
  categoryId: string
  current: number
  usual: number
  /** ANA-30: the change as a share of usual; null when usually nothing. */
  ratio: number | null
  /** ANA-30: above usual by more than the threshold. */
  flagged: boolean
  count: number
  usualCount: number
}

/**
 * ANA-12, ANA-26, ANA-30: each category's spending against its usual (median) period,
 * over the same days while the period is in progress, largest difference first. The
 * usual count is the median count; the split values it at the lookback's average ticket.
 */
export function whatChanged(
  entries: readonly AnalysisEntry[],
  view: AnalysisView,
  threshold = 0.25,
  count = 6,
): CategoryChange[] {
  const going = inProgress(view)
  const days = elapsedDays(view.period, view.today)
  const window = (period: Period) => (going ? firstDays(period, days) : period)
  const lookback = lookbackPeriods(view, count).map(window)
  const current = window(view.period)
  const ids = new Set<string>()
  for (const entry of entries)
    if (entry.categoryId !== null && entry.date >= (lookback[0] ?? current).start)
      ids.add(entry.categoryId)
  const tally = (period: Period, id: string) => {
    let spent = 0
    let bought = 0
    for (const entry of entries) {
      if (entry.categoryId !== id || entry.date < period.start || entry.date > period.end) continue
      spent += entry.spent
      if (entry.spent > 0) bought += 1
    }
    return { spent, count: bought }
  }
  const changes: CategoryChange[] = []
  for (const id of ids) {
    const now = tally(current, id)
    const before = lookback.map((period) => tally(period, id))
    const usual = median(before.map((item) => item.spent)) ?? 0
    const usualCount = median(before.map((item) => item.count)) ?? 0
    const lookbackSpent = before.reduce((sum, item) => sum + item.spent, 0)
    const lookbackCount = before.reduce((sum, item) => sum + item.count, 0)
    const ticket = lookbackCount > 0 ? lookbackSpent / lookbackCount : 0
    const difference = now.spent - usual
    if (difference === 0) continue
    const frequency = Math.round((now.count - usualCount) * ticket)
    const ratio = change(now.spent, usual)
    changes.push({
      categoryId: id,
      current: now.spent,
      usual,
      difference,
      frequency,
      price: difference - frequency,
      ratio,
      flagged: lookback.length > 0 && ratio !== null && ratio > threshold,
      count: now.count,
      usualCount,
    })
  }
  return changes.sort(
    (a, b) =>
      Math.abs(b.difference) - Math.abs(a.difference) || a.categoryId.localeCompare(b.categoryId),
  )
}

/** The dates from `period.start` to `period.end`. */
export function datesIn(period: Period): string[] {
  return Array.from({ length: periodDays(period) }, (_, index) => addDays(period.start, index))
}

/** ANA-20: what was spent on each day of the period, by date. */
export function dailySpending(
  entries: readonly AnalysisEntry[],
  period: Period,
  select: Select = everything,
): Map<string, number> {
  const days = new Map(datesIn(period).map((date) => [date, 0]))
  for (const entry of entries) {
    const day = days.get(entry.date)
    if (day !== undefined && select(entry)) days.set(entry.date, day + entry.spent)
  }
  return days
}
