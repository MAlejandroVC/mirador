import {
  type AnalysisContext,
  type AnalysisEntry,
  type AnalysisView,
  change,
  lookbackPeriods,
  mean,
  median,
  periodTotals,
  spentIn,
} from './analysis.ts'
import type { Category } from './categories.ts'
import { addDays, type Period, shiftPeriod } from './dates.ts'
import { balanceTransactions, spreadInstallments } from './installments.ts'
import { occurrences, type Recurring } from './recurring.ts'
import { amountIn, type Transaction } from './transactions.ts'
import { netWorth, type Wallet, walletBalances } from './wallets.ts'

// Epic 5, looking ahead: what is already committed, where cutting back is easiest, the
// costly times of year and where net worth is heading (ANA-15, ANA-16, ANA-25, ANA-27,
// ANA-31, ANA-32, ANA-36, ANA-40). Pure functions; the caller passes "today".

/** ANA-27: one expense already committed for a coming date. */
export interface CommittedItem {
  date: string
  /** Positive, in the default currency. */
  amount: number
  source: 'installment' | 'recurring'
  /** The purchase for an installment, the recurring transaction otherwise. */
  id: string
  categoryId: string | null
  tagIds: readonly string[]
  payeeId: string | null
  note: string | null
}

export interface CommittedPeriod {
  period: Period
  installments: number
  recurring: number
  total: number
  items: CommittedItem[]
}

/**
 * ANA-27: for this month and each of the next, what is already committed after today:
 * the installment parts still to come (TXN-32) and the recurring expenses not yet
 * added (TXN-09), in the default currency.
 */
export function committed(
  transactions: readonly Transaction[],
  recurrings: readonly Recurring[],
  context: Pick<AnalysisContext, 'walletCurrency' | 'currency' | 'rates'>,
  today: string,
  count = 12,
): CommittedPeriod[] {
  const periods: CommittedPeriod[] = Array.from({ length: count }, (_, step) => ({
    period: shiftPeriod(today, 'month', step),
    installments: 0,
    recurring: 0,
    total: 0,
    items: [],
  }))
  const end = periods.at(-1)?.period.end ?? today
  const add = (item: CommittedItem) => {
    const slot = periods.find(
      (candidate) => item.date >= candidate.period.start && item.date <= candidate.period.end,
    )
    if (!slot) return
    slot.items.push(item)
    if (item.source === 'installment') slot.installments += item.amount
    else slot.recurring += item.amount
    slot.total += item.amount
  }
  const convert = (fields: { walletId: string; amount: number; date: string }) =>
    amountIn(fields as Transaction, context.walletCurrency, context.currency, context.rates)
  const plans = transactions.filter(
    (transaction) => transaction.installments !== undefined && transaction.kind === 'expense',
  )
  for (const part of spreadInstallments(plans)) {
    if (part.date <= today || part.date > end) continue
    const amount = convert(part)
    if (amount === null) continue
    add({
      date: part.date,
      amount: -amount,
      source: 'installment',
      id: part.part?.purchaseId ?? part.id,
      categoryId: part.categoryId ?? null,
      tagIds: part.tagIds ?? [],
      payeeId: part.payeeId ?? null,
      note: part.note ?? null,
    })
  }
  for (const recurring of recurrings) {
    if (recurring.kind !== 'expense' || recurring.excludeFromBudget) continue
    const after =
      recurring.handled !== undefined && recurring.handled > today ? recurring.handled : today
    for (const date of occurrences(recurring, addDays(after, 1), end)) {
      const amount = convert({ walletId: recurring.walletId, amount: recurring.amount, date })
      if (amount === null) continue
      add({
        date,
        amount: -amount,
        source: 'recurring',
        id: recurring.id,
        categoryId: recurring.categoryId ?? null,
        tagIds: recurring.tagIds ?? [],
        payeeId: recurring.payeeId ?? null,
        note: recurring.note ?? null,
      })
    }
  }
  for (const slot of periods) slot.items.sort((a, b) => a.date.localeCompare(b.date))
  return periods
}

/** ANA-31: a Flexible category and the numbers behind its rank. */
export interface Improvement {
  categoryId: string
  /** BUD-01: its usual period, the median of the lookback. */
  usual: number
  /** Its lowest recent period: a level already lived with. */
  proven: number
  /** The most a step would take: 15% of usual, never below the proven level. */
  potential: number
  /** The last three periods' average against the three before; null without them. */
  trend: number | null
  /** How much it moves from period to period: the standard deviation over the mean. */
  variability: number
  /** Each lookback period, oldest first. */
  periods: number[]
}

/**
 * ANA-31: the Flexible categories ranked by how much a step could save. A step cuts at
 * most 15% of the usual period and never below the lowest recent period, so it asks
 * for nothing the person hasn't already done. Ties go to the one growing faster.
 */
export function improvements(
  entries: readonly AnalysisEntry[],
  view: AnalysisView,
  categories: readonly Category[],
  count = 6,
): Improvement[] {
  const lookback = lookbackPeriods(view, count)
  if (lookback.length === 0) return []
  const ranked: Improvement[] = []
  for (const category of categories) {
    if (category.flexibility !== 'flexible' || category.kind === 'income') continue
    const periods = lookback.map((period) =>
      spentIn(entries, period, (entry) => entry.categoryId === category.id),
    )
    const usual = median(periods) ?? 0
    if (usual <= 0) continue
    const proven = Math.max(0, Math.min(...periods))
    const potential = Math.min(Math.round(usual * 0.15), usual - proven)
    if (potential <= 0) continue
    const average = periods.reduce((sum, value) => sum + value, 0) / periods.length
    const spread = Math.sqrt(
      periods.reduce((sum, value) => sum + (value - average) ** 2, 0) / periods.length,
    )
    const recent = mean(periods.slice(-3))
    const earlier = periods.length >= 6 ? mean(periods.slice(-6, -3)) : null
    ranked.push({
      categoryId: category.id,
      usual,
      proven,
      potential,
      trend: recent === null ? null : change(recent, earlier),
      variability: average > 0 ? spread / average : 0,
      periods,
    })
  }
  return ranked.sort(
    (a, b) => b.potential - a.potential || (b.trend ?? 0) - (a.trend ?? 0) || b.usual - a.usual,
  )
}

/** ANA-32: what cutting a usual amount by 5, 10 or 20% saves per period and per year. */
export function cutSavings(
  usual: number,
  periodsPerYear = 12,
  percents: readonly number[] = [5, 10, 20],
): { percent: number; perPeriod: number; perYear: number }[] {
  return percents.map((percent) => {
    const perPeriod = Math.round((usual * percent) / 100)
    return { percent, perPeriod, perYear: perPeriod * periodsPerYear }
  })
}

/** ANA-36: a month of the year that usually costs more than the usual month. */
export interface CostlyMonth {
  /** 1 for January to 12 for December. */
  month: number
  /** Its average across the years seen. */
  spent: number
  /** Above the usual month. */
  extra: number
  /** What it cost in each year seen, oldest first. */
  years: { year: number; spent: number }[]
}

export interface Seasons {
  /** The median of the last 12 complete months. */
  usual: number
  months: CostlyMonth[]
  /** BUD-14: what to set aside every month so the costly ones are covered. */
  setAside: number
}

/**
 * ANA-36: with at least 13 complete months of history, the months of the year that
 * usually cost more than 10% above the usual month, and the monthly amount that covers
 * the difference. Null with less history.
 */
export function seasons(
  entries: readonly AnalysisEntry[],
  today: string,
  firstDate: string | null,
): Seasons | null {
  if (firstDate === null) return null
  const months: { period: Period; spent: number }[] = []
  for (let step = 1; ; step += 1) {
    const period = shiftPeriod(today, 'month', -step)
    if (period.end < firstDate) break
    months.unshift({ period, spent: spentIn(entries, period) })
  }
  if (months.length < 13) return null
  const usual = median(months.slice(-12).map((month) => month.spent)) ?? 0
  const byMonth = new Map<number, { year: number; spent: number }[]>()
  for (const { period, spent } of months) {
    const [year = 0, month = 0] = period.start.split('-').map(Number)
    byMonth.set(month, [...(byMonth.get(month) ?? []), { year, spent }])
  }
  const costly: CostlyMonth[] = []
  for (const [month, years] of byMonth) {
    const spent = mean(years.map((item) => item.spent)) ?? 0
    if (spent > usual * 1.1) costly.push({ month, spent, extra: spent - usual, years })
  }
  costly.sort((a, b) => a.month - b.month)
  return {
    usual,
    months: costly,
    setAside: Math.round(costly.reduce((sum, month) => sum + month.extra, 0) / 12),
  }
}

/** ANA-16: net worth, what I have and what I owe at the end of a month. */
export interface NetWorthPoint {
  period: Period
  netWorth: number
  have: number
  owe: number
}

/**
 * ANA-16: net worth at the end of each of the last `count` months (today for this one),
 * from the transactions and valuations up to that day, at the rates in use then.
 */
export function netWorthHistory(
  wallets: readonly Wallet[],
  transactions: readonly Transaction[],
  context: Pick<AnalysisContext, 'currency' | 'rates'>,
  today: string,
  count = 12,
): NetWorthPoint[] {
  const credit = new Set(
    wallets.filter((wallet) => wallet.features.includes('creditLimit')).map((wallet) => wallet.id),
  )
  const points: NetWorthPoint[] = []
  for (let step = count - 1; step >= 0; step -= 1) {
    const period = shiftPeriod(today, 'month', -step)
    const end = step === 0 ? today : period.end
    const upTo = transactions.filter((transaction) => transaction.date <= end)
    const balances = walletBalances(wallets, balanceTransactions(upTo, credit, end))
    const totals = netWorth(wallets, balances, context.currency, context.rates, end)
    points.push({ period, netWorth: totals.netWorth, have: totals.have, owe: totals.owe })
  }
  return points
}

/** ANA-40: where net worth heads at a steady amount left over each period. */
export interface Projection {
  /** Today's value first, then one per period. */
  points: number[]
  /** How many periods until it reaches the target; null without one, or when never. */
  reachedIn: number | null
}

export function projection(
  start: number,
  perPeriod: number,
  count = 24,
  target?: number,
): Projection {
  const points = Array.from({ length: count + 1 }, (_, step) => start + perPeriod * step)
  let reachedIn: number | null = null
  if (target !== undefined)
    if (start >= target) reachedIn = 0
    else if (perPeriod > 0) reachedIn = Math.ceil((target - start) / perPeriod)
  return { points, reachedIn }
}

/** ANA-25: income and spending in one period. */
export interface FlowPoint {
  period: Period
  income: number
  spent: number
}

/**
 * ANA-25: income and spending in each of the last `count` periods up to the one viewed,
 * and how the last 12 compare with the 12 before, to reveal lifestyle creep.
 */
export function incomeAndSpending(
  entries: readonly AnalysisEntry[],
  view: AnalysisView,
  count = 12,
): { points: FlowPoint[]; spentChange: number | null; incomeChange: number | null } {
  const at = (step: number) =>
    shiftPeriod(view.period.start, view.scope, -step, view.firstDay, view.monthStart)
  const totals = (from: number, to: number) => {
    let income = 0
    let spent = 0
    for (let step = from; step <= to; step += 1) {
      const sums = periodTotals(entries, at(step))
      income += sums.income
      spent += sums.spent
    }
    return { income, spent }
  }
  const points: FlowPoint[] = []
  for (let step = count - 1; step >= 0; step -= 1) {
    const period = at(step)
    if (view.firstDate !== null && period.end < view.firstDate) continue
    const sums = periodTotals(entries, period)
    points.push({ period, income: sums.income, spent: sums.spent })
  }
  // Complete periods only: the last 12 against the 12 before, when there are both.
  const before = at(24)
  const enough = view.firstDate !== null && before.start >= view.firstDate
  const recent = totals(1, 12)
  const earlier = totals(13, 24)
  return {
    points,
    spentChange: enough ? change(recent.spent, earlier.spent) : null,
    incomeChange: enough ? change(recent.income, earlier.income) : null,
  }
}

/** ANA-15: one source of income and how steady it is. */
export interface IncomeSource {
  categoryId: string | null
  /** The average per period over the lookback. */
  average: number
  /** How much it moves from period to period: the standard deviation over the mean. */
  variability: number
  periods: number[]
}

/** ANA-15: income by category over the lookback, largest first. */
export function incomeSources(
  entries: readonly AnalysisEntry[],
  view: AnalysisView,
  count = 6,
): IncomeSource[] {
  const lookback = lookbackPeriods(view, count)
  const ids = new Set<string | null>()
  const start = lookback[0]?.start
  if (start === undefined) return []
  for (const entry of entries)
    if (entry.earned > 0 && entry.date >= start) ids.add(entry.categoryId)
  const sources: IncomeSource[] = []
  for (const id of ids) {
    const periods = lookback.map((period) =>
      entries.reduce(
        (sum, entry) =>
          entry.categoryId === id && entry.date >= period.start && entry.date <= period.end
            ? sum + entry.earned
            : sum,
        0,
      ),
    )
    const average = periods.reduce((sum, value) => sum + value, 0) / periods.length
    const spread = Math.sqrt(
      periods.reduce((sum, value) => sum + (value - average) ** 2, 0) / periods.length,
    )
    sources.push({
      categoryId: id,
      average: Math.round(average),
      variability: average > 0 ? spread / average : 0,
      periods,
    })
  }
  return sources.sort((a, b) => b.average - a.average)
}
