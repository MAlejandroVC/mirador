import { change, type Period, type PeriodScope } from '@repo/core'
import { useTranslation } from 'react-i18next'
import { Amount } from '../../components/ui/amount'
import { formatPeriod, formatShare, formatShortDate, useMoney } from '../../lib/format'

// ANA-33: how analysis puts numbers into words. Amounts follow DL-NUM-01 to DL-NUM-07;
// a comparison with the usual period is a plain phrase, and only a rise past the
// flag threshold (ANA-30) takes `warning`, in words only (DL-COL-05).

export const flagThreshold = 0.25
// Within 5% of usual reads as "about the same as usual", so small noise isn't news.
const sameBand = 0.05

export function useWords(currency: string, today: string) {
  const { t } = useTranslation()
  const money = useMoney(currency)
  const locale = money.locale
  const value = (minor: number) => ({ minor, currency })
  return {
    t,
    locale,
    today,
    /** DL-NUM-02: an amount at body size; negative ones keep their minus (DL-NUM-03). */
    amount: (minor: number, tone?: 'moss' | 'muted') =>
      tone === 'moss' && minor > 0 ? (
        <Amount
          parts={money.parts(value(minor), 'always')}
          label={money.text(value(minor), 'always')}
          tone="moss"
        />
      ) : (
        <Amount
          parts={money.parts(value(minor))}
          label={money.text(value(minor))}
          {...(tone === 'muted' ? { tone } : {})}
        />
      ),
    /** DL-NUM-01: the screen's one hero amount. */
    hero: (minor: number) => (
      <Amount
        parts={money.parts(value(minor))}
        label={money.text(value(minor))}
        size="hero"
        tone="hero"
      />
    ),
    /** DL-NUM-02: the answer on a question tile, cents smaller and muted. */
    figure: (minor: number) => (
      <Amount parts={money.parts(value(minor))} label={money.text(value(minor))} size="figure" />
    ),
    /** An amount inside a sentence. */
    text: (minor: number) => money.text(value(minor)),
    share: (share: number) => formatShare(share, locale),
    date: (date: string) => formatShortDate(date, today, locale),
    period: (period: Period, scope: PeriodScope) =>
      formatPeriod(period, scope, locale, (number, year) =>
        t('transactions.period.quarter', { number, year }),
      ),
    /** "Oct", for a column under a month. */
    monthShort: (period: Period) =>
      new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
        .format(new Date(`${period.start}T00:00:00Z`))
        .replace('.', ''),
    monthLong: (period: Period) =>
      new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
        new Date(`${period.start}T00:00:00Z`),
      ),
    /** Narrow weekday names, Sunday first. */
    weekdays: (style: 'narrow' | 'short' | 'long') =>
      Array.from({ length: 7 }, (_, day) =>
        new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(
          new Date(Date.UTC(2023, 0, 1 + day)),
        ),
      ),
    /**
     * ANA-12, ANA-30: "same as usual", "12% above usual" or "8% below usual" (or, to
     * compare with one figure, "12% more"); `flagged` when the rise passes the threshold,
     * for `warning`.
     */
    versusUsual: (current: number, usual: number | null, words: 'usual' | 'compare' = 'usual') => {
      const ratio = change(current, usual)
      if (ratio === null) return null
      if (Math.abs(ratio) < sameBand) return { text: t(`analysis.${words}.same`), flagged: false }
      const percent = formatShare(Math.abs(ratio), locale)
      return ratio > 0
        ? { text: t(`analysis.${words}.above`, { percent }), flagged: ratio > flagThreshold }
        : { text: t(`analysis.${words}.below`, { percent }), flagged: false }
    },
  }
}

export type Words = ReturnType<typeof useWords>
