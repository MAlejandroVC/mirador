import {
  type FormatOptions,
  formatDecimal,
  formatMoney,
  type Money,
  moneyParts,
  percentDecimals,
  rateDecimals,
} from '@repo/core'
import { useTranslation } from 'react-i18next'

// DL-NUM-05: amounts and dates are formatted for the app language by the platform.
export const locales = { en: 'en-US', es: 'es-MX' } as const

export function useLocale(): string {
  const { i18n } = useTranslation()
  return i18n.language === 'es' ? locales.es : locales.en
}

/** Formats money for the app language, with `mainCurrency` shown by its symbol only. */
export function useMoney(mainCurrency: string) {
  const locale = useLocale()
  const options = (signs: FormatOptions['signs']): FormatOptions => ({
    locale,
    mainCurrency,
    signs,
  })
  return {
    locale,
    text: (money: Money, signs: FormatOptions['signs'] = 'negative') =>
      formatMoney(money, options(signs)),
    parts: (money: Money, signs: FormatOptions['signs'] = 'negative') =>
      moneyParts(money, options(signs)),
  }
}

/** DL-NUM-07: whole percents, and "<1%" for a sliver. */
export function formatShare(share: number, locale: string): string {
  if (share > 0 && share < 0.01)
    return `<${new Intl.NumberFormat(locale, { style: 'percent' }).format(0.01)}`
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(share)
}

/**
 * DL-NUM-08: "Today", "Yesterday", the weekday within the last week, then "Oct 3"
 * ("3 oct"), with the year only when it isn't this one. `today` is a calendar date.
 */
export function formatDay(
  date: string,
  today: string,
  locale: string,
  words: { today: string; yesterday: string },
): string {
  const day = (value: string) => {
    const [year = 0, month = 1, dayOfMonth = 1] = value.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, dayOfMonth))
  }
  const then = day(date)
  const now = day(today)
  const diff = Math.round((now.getTime() - then.getTime()) / 86_400_000)
  if (diff === 0) return words.today
  if (diff === 1) return words.yesterday
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(then)
  if (diff > 1 && diff < 7) {
    const weekday = format({ weekday: 'long' })
    return weekday.charAt(0).toLocaleUpperCase(locale) + weekday.slice(1)
  }
  const sameYear = then.getUTCFullYear() === now.getUTCFullYear()
  return format({
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).replace('.', '')
}

/** DL-NUM-08: "Oct 20" ("20 oct"), with the year only when it isn't this one. */
export function formatShortDate(date: string, today: string, locale: string): string {
  const [year = 0, month = 1, dayOfMonth = 1] = date.split('-').map(Number)
  const sameYear = today.startsWith(`${String(year)}-`)
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
    .format(new Date(Date.UTC(year, month - 1, dayOfMonth)))
    .replace('.', '')
}

/** SYS-04: an exchange rate for reading, such as "18.45", with at least two decimals. */
export function formatRate(rate: number, locale: string): string {
  return formatDecimal(rate, rateDecimals, locale, 2)
}

/** WAL-13: an interest rate in hundredths of a percent, such as "10.5%". */
export function formatPercent(basisPoints: number, locale: string): string {
  return `${formatDecimal(basisPoints, percentDecimals, locale)}%`
}

/**
 * The name of a span of the transaction list (TXN-22): "October 2026", "Oct 12 – 18",
 * "Q4 2026" or "2026". `quarter` words the quarter in the person's language.
 */
export function formatPeriod(
  period: { start: string; end: string },
  scope: 'week' | 'month' | 'quarter' | 'year',
  locale: string,
  quarter: (number: number, year: number) => string,
): string {
  const day = (value: string) => {
    const [year = 0, month = 1, dayOfMonth = 1] = value.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, dayOfMonth))
  }
  const start = day(period.start)
  const year = start.getUTCFullYear()
  switch (scope) {
    case 'year':
      return String(year)
    case 'quarter':
      return quarter(Math.floor(start.getUTCMonth() / 3) + 1, year)
    case 'month': {
      // SYS-02: a month that starts on another day than the 1st shows its days.
      if (start.getUTCDate() !== 1)
        return new Intl.DateTimeFormat(locale, {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }).formatRange(start, day(period.end))
      const text = new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(start)
      return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
    }
    case 'week':
      return new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).formatRange(start, day(period.end))
  }
}
