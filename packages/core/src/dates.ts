// Dates are calendar dates, YYYY-MM-DD, with no time or time zone.

/** The calendar date of a moment on this device's clock, such as today's. */
export function toCalendarDate(moment: Date): string {
  const month = String(moment.getMonth() + 1).padStart(2, '0')
  const day = String(moment.getDate()).padStart(2, '0')
  return `${String(moment.getFullYear())}-${month}-${day}`
}
