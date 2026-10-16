import { type Repeat, repeatPreset } from '@repo/core'
import type { TFunction } from 'i18next'

/** How it ends, as the form holds it (TXN-09). */
export type Ends =
  { kind: 'never' } | { kind: 'on'; date: string } | { kind: 'after'; times: number }

/** TXN-09: "Every month", "Every 2 weeks" or "Every 10 days"; "Never" when it doesn't. */
export function repeatLabel(t: TFunction, every: Repeat | null): string {
  if (!every) return t('recurring.never')
  const preset = repeatPreset(every)
  if (preset) return t(`recurring.presets.${preset}`)
  return t(`recurring.everyCount.${every.unit}`, { count: every.count })
}

/** TXN-09: "Never", "On Mar 1, 2027" or "After 12 times". */
export function endsLabel(t: TFunction, ends: Ends, locale: string): string {
  switch (ends.kind) {
    case 'never':
      return t('recurring.endsOptions.never')
    case 'on':
      return t('recurring.endsOn', {
        date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
          new Date(`${ends.date}T12:00:00Z`),
        ),
      })
    case 'after':
      return t('recurring.endsAfter', { count: ends.times })
  }
}
