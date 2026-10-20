import { z } from 'zod'

// Epic 1 (WAL): wallets. They live in encrypted records (SEC-01), so the server never
// learns a wallet's name, type, currency or balance; their transactions are in
// transactions.ts.

/** WAL-11: a preset only decides which optional features start switched on. */
export const walletPresets = [
  'cash',
  'checking',
  'savings',
  'investment',
  'creditCard',
  'loan',
  'voucher',
  'generic',
] as const
export type WalletPreset = (typeof walletPresets)[number]

/** WAL-12: the optional features any wallet can switch on or off. */
export const walletFeatures = [
  'interest',
  'fees',
  'creditLimit',
  'loanSchedule',
  'valuations',
  'liquid',
] as const
export type WalletFeature = (typeof walletFeatures)[number]

/** WAL-23: the curated icons a wallet can take (DL-ICO-01, DL-PRI-04). */
export const walletIcons = [
  'wallet',
  'money',
  'coins',
  'bank',
  'piggyBank',
  'vault',
  'creditCard',
  'handCoins',
  'chartLineUp',
  'gift',
  'storefront',
  'briefcase',
  'house',
  'car',
  'graduationCap',
  'airplane',
] as const
export type WalletIcon = (typeof walletIcons)[number]

/** The 12 curated colors of wallets, category groups and tags (DL-COL-11, WAL-23). */
export const curatedColors = [
  'clay',
  'bark',
  'marigold',
  'meadow',
  'moss',
  'lagoon',
  'lake',
  'dusk',
  'heather',
  'plum',
  'berry',
  'stone',
] as const
export type CuratedColor = (typeof curatedColors)[number]

/** An ISO 4217 code, such as MXN. */
export const currencyCode = z.string().regex(/^[A-Z]{3}$/)

/** A calendar date, YYYY-MM-DD, with no time or time zone. */
export const calendarDate = z.iso.date()

export const walletRecordType = 'wallet'

/** A day of the month, 1 to 31; shorter months use their last day. */
const dayOfMonth = z.int().min(1).max(31)
/** Minor units that can only be positive, such as a limit or a fee. */
const positiveMinor = z.int().positive()

/** WAL-13: an annual rate in hundredths of a percent (1050 is 10.50%). */
export const interestSettings = z.object({
  rate: z.int().min(0).max(100_000),
  type: z.enum(['nominal', 'effective']),
  compounding: z.enum(['daily', 'monthly', 'yearly']),
})

/** WAL-15: a fee and the last date confirmed or skipped. */
export const feeSettings = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(60),
  amount: positiveMinor,
  every: z.enum(['month', 'year']),
  // A reminder of the fee's conditions, such as when it is waived.
  note: z.string().trim().max(200).optional(),
  start: calendarDate,
  handled: calendarDate.optional(),
})

/** WAL-16: the credit limit and the statement and payment days. */
export const creditSettings = z.object({
  limit: positiveMinor,
  closingDay: dayOfMonth,
  dueDay: dayOfMonth,
})

/** WAL-17: the loan contract; its rate is the wallet's interest (WAL-13). */
export const loanSettings = z.object({
  principal: positiveMinor,
  termMonths: z.int().min(1).max(600),
  payment: positiveMinor,
  paymentDay: dayOfMonth,
})

export const walletRecord = z.object({
  name: z.string().trim().min(1).max(60),
  preset: z.enum(walletPresets),
  // WAL-02, SYS-04: every amount in this wallet is in its currency.
  currency: currencyCode,
  icon: z.enum(walletIcons),
  color: z.enum(curatedColors),
  // WAL-12: on or off whatever the preset; the preset only set where they started.
  features: z.array(z.enum(walletFeatures)),
  // WAL-03, WAL-04: an inactive wallet is hidden from pickers and still counted.
  active: z.boolean(),
  // WAL-09: left out of net worth, or out of the budget, each on its own.
  inNetWorth: z.boolean(),
  inBudget: z.boolean(),
  // WAL-10: its place in the list; wallets without one follow, oldest first.
  order: z.int().min(0).optional(),
  // WAL-13 to WAL-17: each feature's details. They stay when the feature is switched
  // off, so switching it back on brings them back.
  interest: interestSettings.optional(),
  fees: z.array(feeSettings).max(20).optional(),
  credit: creditSettings.optional(),
  loan: loanSettings.optional(),
  // WAL-07, DSH-05: the last day the person checked its balance, even when it matched,
  // so Home asks again only after a while.
  checkedOn: calendarDate.optional(),
})
export type WalletRecord = z.infer<typeof walletRecord>

export const exchangeRateRecordType = 'exchangeRate'

// SYS-04, SYS-05: a rate the person entered, kept as dated history. One unit of `from`
// buys `rate` millionths of a unit of `to` (18.45 is 18_450_000), an integer like money.
export const exchangeRateRecord = z
  .object({
    from: currencyCode,
    to: currencyCode,
    rate: z.int().positive(),
    date: calendarDate,
  })
  .refine((rate) => rate.from !== rate.to)
export type ExchangeRateRecord = z.infer<typeof exchangeRateRecord>
