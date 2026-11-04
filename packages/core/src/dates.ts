// Dates are calendar dates, YYYY-MM-DD, with no time or time zone.

/** The calendar date of a moment on this device's clock, such as today's. */
export function toCalendarDate(moment: Date): string {
  const month = String(moment.getMonth() + 1).padStart(2, '0')
  const day = String(moment.getDate()).padStart(2, '0')
  return `${String(moment.getFullYear())}-${month}-${day}`
}

function parts(date: string): [number, number, number] {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number)
  return [year, month, day]
}

function format(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** How many days the month has; `month` runs 1 to 12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * The date `months` later (or earlier), on `day` of that month, or its last day when
 * the month is shorter: Jan 31 plus one month is Feb 28.
 */
export function addMonths(date: string, months: number, day = parts(date)[2]): string {
  const [year, month] = parts(date)
  const index = year * 12 + (month - 1) + months
  const nextYear = Math.floor(index / 12)
  const nextMonth = (index % 12) + 1
  return format(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)))
}

/** Whole days from `from` to `to`; negative when `to` comes first. */
export function daysBetween(from: string, to: string): number {
  const time = (date: string) => {
    const [year, month, day] = parts(date)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((time(to) - time(from)) / 86_400_000)
}

/**
 * The first date on or after `from` that falls on `day` of its month, or on the month's
 * last day when it is shorter (day 31 in April is April 30).
 */
export function nextDayOfMonth(from: string, day: number): string {
  const [year, month, today] = parts(from)
  const thisMonth = Math.min(day, daysInMonth(year, month))
  if (thisMonth >= today) return format(year, month, thisMonth)
  return addMonths(format(year, month, 1), 1, day)
}

/** The last date before `before` that falls on `day` of its month (clamped as above). */
export function previousDayOfMonth(before: string, day: number): string {
  const [year, month, today] = parts(before)
  const thisMonth = Math.min(day, daysInMonth(year, month))
  if (thisMonth < today) return format(year, month, thisMonth)
  return addMonths(format(year, month, 1), -1, day)
}

export interface Period {
  /** First day, inclusive. */
  start: string
  /** Last day, inclusive. */
  end: string
}

/**
 * The calendar month around `date`. Budget periods that start on a chosen day (SYS-02)
 * arrive with the budget epic; until then "this period" is the month.
 */
export function monthOf(date: string): Period {
  const [year, month] = parts(date)
  return { start: format(year, month, 1), end: format(year, month, daysInMonth(year, month)) }
}

/** The day of the week, 0 for Sunday to 6 for Saturday. */
export function weekday(date: string): number {
  const [year, month, day] = parts(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/**
 * The weeks of the month that holds `date`, for a date picker: each week has seven
 * slots starting on `firstDay` (0 is Sunday), with null before the 1st and after the
 * last day.
 */
export function calendarWeeks(date: string, firstDay = 0): (string | null)[][] {
  const [year, month] = parts(date)
  const lead = (weekday(format(year, month, 1)) - firstDay + 7) % 7
  const slots: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth(year, month) }, (_, index) =>
      format(year, month, index + 1),
    ),
  ]
  while (slots.length % 7 !== 0) slots.push(null)
  return Array.from({ length: slots.length / 7 }, (_, week) => slots.slice(week * 7, week * 7 + 7))
}

/** The date `days` later, or earlier when negative. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = parts(date)
  const moment = new Date(Date.UTC(year, month - 1, day + days))
  return format(moment.getUTCFullYear(), moment.getUTCMonth() + 1, moment.getUTCDate())
}

/** How long a span of the transaction list is (TXN-22). */
export type PeriodScope = 'week' | 'month' | 'quarter' | 'year'

/**
 * SYS-02: the budget month that holds `date` when months start on `startDay` (1 to 31;
 * a short month starts on its last day instead). With day 1 it is the calendar month.
 */
export function budgetMonthOf(date: string, startDay = 1): Period {
  if (startDay <= 1) return monthOf(date)
  const [year, month, day] = parts(date)
  const thisStart = format(year, month, Math.min(startDay, daysInMonth(year, month)))
  const start =
    day >= Math.min(startDay, daysInMonth(year, month))
      ? thisStart
      : addMonths(thisStart, -1, startDay)
  return { start, end: addDays(addMonths(start, 1, startDay), -1) }
}

/**
 * The week, month, quarter or year that holds `date`. A week starts on `firstDay`
 * (0 is Sunday, SYS-03); a month on `monthStart` (SYS-02), quarters and years stay
 * calendar ones.
 */
export function periodOf(date: string, scope: PeriodScope, firstDay = 0, monthStart = 1): Period {
  const [year, month] = parts(date)
  switch (scope) {
    case 'week': {
      const start = addDays(date, -((weekday(date) - firstDay + 7) % 7))
      return { start, end: addDays(start, 6) }
    }
    case 'month':
      return budgetMonthOf(date, monthStart)
    case 'quarter': {
      const first = month - ((month - 1) % 3)
      return {
        start: format(year, first, 1),
        end: format(year, first + 2, daysInMonth(year, first + 2)),
      }
    }
    case 'year':
      return { start: format(year, 1, 1), end: format(year, 12, 31) }
  }
}

/** The period `steps` before (negative) or after the one that holds `date`. */
export function shiftPeriod(
  date: string,
  scope: PeriodScope,
  steps: number,
  firstDay = 0,
  monthStart = 1,
): Period {
  const { start } = periodOf(date, scope, firstDay, monthStart)
  const moved =
    scope === 'week'
      ? addDays(start, steps * 7)
      : scope === 'month'
        ? addMonths(start, steps, monthStart)
        : addMonths(start, steps * (scope === 'quarter' ? 3 : 12), 1)
  return periodOf(moved, scope, firstDay, monthStart)
}

/** Whether `date` falls in `period`, both ends included. */
export function inPeriod(date: string, period: Period): boolean {
  return date >= period.start && date <= period.end
}
