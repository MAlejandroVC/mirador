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
