import { type AnalysisEntry, datesIn, median, type Select } from './analysis.ts'
import { addDays, daysBetween, type Period, weekday } from './dates.ts'

// Epic 5, habits: when and how the money goes (ANA-20 to ANA-29, ANA-37). Every figure
// comes from what a transaction already records; nothing asks the person for more.

const everything: Select = () => true

/** Total spent per date over `range`, refunds taken off. */
function spentByDate(
  entries: readonly AnalysisEntry[],
  range: Period,
  select: Select,
): Map<string, number> {
  const days = new Map(datesIn(range).map((date) => [date, 0]))
  for (const entry of entries) {
    const day = days.get(entry.date)
    if (day !== undefined && select(entry)) days.set(entry.date, day + entry.spent)
  }
  return days
}

/**
 * ANA-22: the average spent on each day of the week over `range`, Sunday first: each
 * weekday's total divided by how many times it came up, so a range with five Fridays
 * and four Mondays still compares fairly.
 */
export function byWeekday(
  entries: readonly AnalysisEntry[],
  range: Period,
  select: Select = everything,
): number[] {
  const totals = Array.from({ length: 7 }, () => 0)
  const times = Array.from({ length: 7 }, () => 0)
  for (const [date, spent] of spentByDate(entries, range, select)) {
    const day = weekday(date)
    totals[day] = (totals[day] ?? 0) + spent
    times[day] = (times[day] ?? 0) + 1
  }
  return totals.map((total, day) => {
    const count = times[day] ?? 0
    return count > 0 ? Math.round(total / count) : 0
  })
}

/**
 * ANA-22: the average spent in each week of the period (days 1 to 7, 8 to 14 and so
 * on, the last week taking the rest), over the periods given.
 */
export function byWeekOfPeriod(
  entries: readonly AnalysisEntry[],
  periods: readonly Period[],
  select: Select = everything,
): number[] {
  const totals = Array.from({ length: 5 }, () => 0)
  for (const period of periods)
    for (const [date, spent] of spentByDate(entries, period, select)) {
      const week = Math.min(4, Math.floor(daysBetween(period.start, date) / 7))
      totals[week] = (totals[week] ?? 0) + spent
    }
  return periods.length === 0 ? totals : totals.map((total) => Math.round(total / periods.length))
}

/** ANA-22: spending on the days right after money comes in, against the other days. */
export interface Payday {
  /** How many paydays the range had. */
  paydays: number
  /** The average spent per day in the `window` days from each payday, that day included. */
  after: number
  /** The average spent per day on every other day. */
  otherDays: number
}

/**
 * ANA-22: a payday is a day with income of at least half the range's largest single
 * income, so small transfers in and interest don't count as one.
 */
export function paydaySpending(
  entries: readonly AnalysisEntry[],
  range: Period,
  window = 3,
  select: Select = everything,
): Payday {
  let largest = 0
  for (const entry of entries)
    if (entry.date >= range.start && entry.date <= range.end)
      largest = Math.max(largest, entry.earned)
  const paydays = new Set<string>()
  for (const entry of entries)
    if (entry.date >= range.start && entry.date <= range.end && largest > 0)
      if (entry.earned >= largest / 2) paydays.add(entry.date)
  const near = new Set<string>()
  for (const payday of paydays)
    for (let day = 0; day < window; day += 1) near.add(addDays(payday, day))
  let after = 0
  let afterDays = 0
  let other = 0
  let otherDays = 0
  for (const [date, spent] of spentByDate(entries, range, select)) {
    if (near.has(date)) {
      after += spent
      afterDays += 1
    } else {
      other += spent
      otherDays += 1
    }
  }
  return {
    paydays: paydays.size,
    after: afterDays > 0 ? Math.round(after / afterDays) : 0,
    otherDays: otherDays > 0 ? Math.round(other / otherDays) : 0,
  }
}

/** ANA-28: what a day with a tag costs against a day without it. */
export interface TagDays {
  tagId: string
  days: number
  /** The average spent per day on days with the tag, every category included. */
  withTag: number
  /** The average spent per day on the other days of the range. */
  withoutTag: number
  /** The same per category, largest difference first. */
  categories: { categoryId: string; withTag: number; withoutTag: number }[]
}

/** ANA-28: for each tag used in the range, how its days compare with the others. */
export function tagDays(entries: readonly AnalysisEntry[], range: Period): TagDays[] {
  const inRange = entries.filter((entry) => entry.date >= range.start && entry.date <= range.end)
  const all = datesIn(range).length
  const tags = new Map<string, Set<string>>()
  for (const entry of inRange)
    for (const tag of entry.tagIds) {
      const days = tags.get(tag) ?? new Set<string>()
      days.add(entry.date)
      tags.set(tag, days)
    }
  const results: TagDays[] = []
  for (const [tagId, days] of tags) {
    const other = all - days.size
    let withTag = 0
    let withoutTag = 0
    const byCategory = new Map<string, { with: number; without: number }>()
    for (const entry of inRange) {
      const tagged = days.has(entry.date)
      if (tagged) withTag += entry.spent
      else withoutTag += entry.spent
      if (entry.categoryId === null) continue
      const category = byCategory.get(entry.categoryId) ?? { with: 0, without: 0 }
      if (tagged) category.with += entry.spent
      else category.without += entry.spent
      byCategory.set(entry.categoryId, category)
    }
    const perDay = (total: number, count: number) => (count > 0 ? Math.round(total / count) : 0)
    results.push({
      tagId,
      days: days.size,
      withTag: perDay(withTag, days.size),
      withoutTag: perDay(withoutTag, other),
      categories: [...byCategory.entries()]
        .map(([categoryId, totals]) => ({
          categoryId,
          withTag: perDay(totals.with, days.size),
          withoutTag: perDay(totals.without, other),
        }))
        .filter((category) => category.withTag !== 0 || category.withoutTag !== 0)
        .sort(
          (a, b) =>
            Math.abs(b.withTag - b.withoutTag) - Math.abs(a.withTag - a.withoutTag) ||
            a.categoryId.localeCompare(b.categoryId),
        ),
    })
  }
  return results.sort((a, b) => b.withTag - b.withoutTag - (a.withTag - a.withoutTag))
}

/** ANA-29: a category that tends to come with another on the same day. */
export interface SameDayPair {
  first: string
  second: string
  /** Days the first appears. */
  days: number
  /** Of those, the days the second appears too. */
  together: number
  /** The second's median amount on those days. */
  usual: number
}

/**
 * ANA-29: pairs where the second category appears on at least half the days the first
 * does, with at least `minDays` such days, and `lift` times as often as on any day with
 * spending, most frequent first. Locked categories (rent,
 * a loan) are left out: they land on their own date, so meeting them says nothing about
 * a habit. Each pair of categories shows once.
 */
export function sameDayPairs(
  entries: readonly AnalysisEntry[],
  range: Period,
  minDays = 5,
  lift = 1.5,
): SameDayPair[] {
  const days = new Map<string, Map<string, number>>()
  for (const entry of entries) {
    if (entry.date < range.start || entry.date > range.end) continue
    if (entry.categoryId === null || entry.spent <= 0 || entry.flexibility === 'locked') continue
    const day = days.get(entry.date) ?? new Map<string, number>()
    day.set(entry.categoryId, (day.get(entry.categoryId) ?? 0) + entry.spent)
    days.set(entry.date, day)
  }
  const appears = new Map<string, number>()
  for (const day of days.values())
    for (const id of day.keys()) appears.set(id, (appears.get(id) ?? 0) + 1)
  const pairs: SameDayPair[] = []
  for (const [first, count] of appears) {
    if (count < minDays) continue
    const together = new Map<string, number[]>()
    for (const day of days.values()) {
      if (!day.has(first)) continue
      for (const [second, spent] of day)
        if (second !== first) together.set(second, [...(together.get(second) ?? []), spent])
    }
    for (const [second, amounts] of together)
      if (
        amounts.length >= minDays &&
        amounts.length * 2 >= count &&
        // Something bought most days (coffee) meets everything; only a pair that comes
        // together clearly more often than the second does on its own is a habit.
        amounts.length / count >= lift * ((appears.get(second) ?? 0) / days.size)
      )
        pairs.push({
          first,
          second,
          days: count,
          together: amounts.length,
          usual: median(amounts) ?? 0,
        })
  }
  pairs.sort(
    (a, b) =>
      b.together / b.days - a.together / a.days ||
      b.together - a.together ||
      a.first.localeCompare(b.first),
  )
  // Of the two directions, keep the one led by the category seen on more days: "movies,
  // with snacks on 5 of 8 days" says more than "snacks, always with movies".
  const best = new Map<string, SameDayPair>()
  for (const pair of pairs) {
    const key = [pair.first, pair.second].sort().join(' ')
    const kept = best.get(key)
    if (!kept || pair.days > kept.days) best.set(key, pair)
  }
  return pairs.filter((pair) => best.get([pair.first, pair.second].sort().join(' ')) === pair)
}

/** ANA-24: a charge that comes back on a regular schedule. */
export interface RecurringCharge {
  /** The payee, or the note when there is no payee. */
  payeeId: string | null
  note: string | null
  categoryId: string | null
  /** The typical amount and the days between charges. */
  amount: number
  interval: number
  /** The interval in calendar words, so a monthly charge reads and costs 12 a year. */
  every: Cadence
  times: number
  last: string
  /** ANA-24: what it costs over a year at that amount and interval. */
  yearly: number
  /** Already set up as a recurring transaction (TXN-09). */
  scheduled: boolean
  transactionIds: string[]
}

export interface Cadence {
  unit: 'day' | 'week' | 'month' | 'year'
  count: number
}

/**
 * ANA-24: a median gap in calendar terms. Months vary from 28 to 31 days, so a gap within
 * a few days of n months is n months; anything else stays in days.
 */
export function cadence(interval: number): Cadence {
  if (interval >= 6 && interval <= 8) return { unit: 'week', count: 1 }
  if (interval >= 13 && interval <= 15) return { unit: 'week', count: 2 }
  for (let count = 1; count <= 6; count++)
    if (Math.abs(interval - 30.44 * count) <= 2.5 * count) return { unit: 'month', count }
  if (interval >= 358 && interval <= 372) return { unit: 'year', count: 1 }
  return { unit: 'day', count: Math.round(interval) }
}

function perYear(every: Cadence) {
  const units = { day: 365, week: 52, month: 12, year: 1 }
  return units[every.unit] / every.count
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * ANA-24: charges with the same payee (or, with none, the same note) seen at least
 * `minTimes` times, every amount within 10% of their median and every gap within a
 * quarter of the median gap, which must be at least 6 days. Installment parts are
 * left out: their schedule is already known. Most expensive per year first.
 */
export function recurringCharges(
  entries: readonly AnalysisEntry[],
  today: string,
  minTimes = 3,
): RecurringCharge[] {
  const groups = new Map<string, AnalysisEntry[]>()
  for (const entry of entries) {
    if (entry.spent <= 0 || entry.installment || entry.date > today) continue
    const key =
      entry.recurringId !== null
        ? `r:${entry.recurringId}`
        : entry.payeeId !== null
          ? `p:${entry.payeeId}`
          : entry.note !== null && fold(entry.note) !== ''
            ? `n:${fold(entry.note)}`
            : null
    if (key === null) continue
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  const charges: RecurringCharge[] = []
  for (const [key, list] of groups) {
    // Two on the same day are one charge split in two, or a mistake; neither is a gap.
    const byDate = new Map<string, number>()
    for (const entry of list) byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.spent)
    const dates = [...byDate.keys()].sort()
    if (dates.length < minTimes) continue
    const amounts = [...byDate.values()]
    const amount = median(amounts) ?? 0
    if (amounts.some((value) => Math.abs(value - amount) > amount * 0.1)) continue
    const gaps = dates.slice(1).map((date, index) => daysBetween(dates[index] ?? date, date))
    const interval = median(gaps) ?? 0
    if (interval < 6 || gaps.some((gap) => Math.abs(gap - interval) > interval * 0.25)) continue
    const last = dates.at(-1) ?? today
    // One that stopped (two gaps late) is no longer a cost.
    if (daysBetween(last, today) > interval * 2) continue
    const first = list[0]
    const every = cadence(interval)
    charges.push({
      payeeId: first?.payeeId ?? null,
      note: first?.note ?? null,
      categoryId: first?.categoryId ?? null,
      amount,
      interval,
      every,
      times: dates.length,
      last,
      yearly: Math.round(amount * perYear(every)),
      scheduled: key.startsWith('r:'),
      transactionIds: list.map((entry) => entry.transactionId),
    })
  }
  return charges.sort((a, b) => b.yearly - a.yearly)
}

/** ANA-37: the small expenses of a range against each category group. */
export interface SmallPurchases {
  /** The amount below which an expense counts as small. */
  below: number
  count: number
  total: number
  /** Category groups, with what each spent in the range, largest first. */
  groups: { groupId: string; spent: number }[]
}

/**
 * ANA-37: expenses under `below` (by default the median expense of the range) added up,
 * next to what each category group spent, so many small ones can be seen as one.
 */
export function smallPurchases(
  entries: readonly AnalysisEntry[],
  range: Period,
  below?: number,
): SmallPurchases {
  const inRange = entries.filter(
    (entry) => entry.date >= range.start && entry.date <= range.end && entry.spent > 0,
  )
  const limit = below ?? median(inRange.map((entry) => entry.spent)) ?? 0
  let count = 0
  let total = 0
  const groups = new Map<string, number>()
  for (const entry of inRange) {
    if (entry.spent < limit) {
      count += 1
      total += entry.spent
    }
    if (entry.groupId !== null)
      groups.set(entry.groupId, (groups.get(entry.groupId) ?? 0) + entry.spent)
  }
  return {
    below: limit,
    count,
    total,
    groups: [...groups.entries()]
      .map(([groupId, spent]) => ({ groupId, spent }))
      .sort((a, b) => b.spent - a.spent),
  }
}
