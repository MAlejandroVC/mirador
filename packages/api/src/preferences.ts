import { z } from 'zod'
import { budgetSettings } from './budget.ts'
import { calendarDate, currencyCode } from './wallets.ts'

// Epic 10 settings that follow the person to every device, in one encrypted record.
// Appearance stays per device (SYS-16, SYS-17).
export const preferencesRecordType = 'preferences'

/** DSH-10: the cards Home can show, in their first order. */
export const homeCards = [
  'attention',
  'coming',
  'goals',
  'netWorth',
  'highlights',
  'latest',
] as const
export type HomeCard = (typeof homeCards)[number]

export const preferencesRecord = z.object({
  // SYS-01: new wallets start with it and every total is shown in it.
  defaultCurrency: currencyCode,
  // WAL-24: the wallet new transactions start in, until the person picks another.
  defaultWalletId: z.string().min(1).max(64).optional(),
  // SYS-02, SYS-09: when budget months start and how the plan is built.
  budget: budgetSettings.optional(),
  // DSH-10: Home's cards in the person's order, and those they hid. This month always
  // comes first, so it isn't listed.
  home: z
    .object({
      order: z.array(z.enum(homeCards)).max(homeCards.length),
      hidden: z.array(z.enum(homeCards)).max(homeCards.length),
    })
    .optional(),
  // DSH-09: the day the person first looked over their needs and wants, which ticks
  // that step of Get started.
  categoriesReviewedOn: calendarDate.optional(),
})
export type PreferencesRecord = z.infer<typeof preferencesRecord>
