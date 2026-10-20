import type { Period } from '@repo/core'
import { useWords } from '../analysis/use-words'

/** Budget wording on top of analysis's: months and dates as the plan names them. */
export function useBudgetWords(currency: string, today: string) {
  const words = useWords(currency, today)
  const format = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(words.locale, { ...options, timeZone: 'UTC' })
      .format(new Date(`${date}T00:00:00Z`))
      .replace('.', '')
  return {
    ...words,
    /** "Oct 2027", for a goal's date. */
    monthYear: (date: string) => format(date, { month: 'short', year: 'numeric' }),
    /** "October", the budget month by the month it starts in (SYS-02), inside a sentence. */
    monthName: (period: Period) => format(period.start, { month: 'long' }),
    /**
     * The same month standing alone or opening a sentence: Spanish writes "octubre" inside
     * a sentence and "Octubre" as a heading.
     */
    monthTitle: (period: Period) => {
      const name = format(period.start, { month: 'long' })
      return name.charAt(0).toLocaleUpperCase(words.locale) + name.slice(1)
    },
    /** "October" on the month bar, or "January 2027" for a month of another year. */
    monthBar: (period: Period) => {
      const name = format(
        period.start,
        period.start.slice(0, 4) === today.slice(0, 4)
          ? { month: 'long' }
          : { month: 'long', year: 'numeric' },
      )
      return name.charAt(0).toLocaleUpperCase(words.locale) + name.slice(1)
    },
    /** "June" in a sentence, or "Jun 2025" for a month of another year. */
    monthIn: (period: Period) =>
      period.start.slice(0, 4) === today.slice(0, 4)
        ? format(period.start, { month: 'long' })
        : format(period.start, { month: 'short', year: 'numeric' }),
    /** "Oct 31", a day of this year or "Oct 31, 2027" of another. */
    day: (date: string) => words.date(date),
  }
}

export type BudgetWords = ReturnType<typeof useBudgetWords>
