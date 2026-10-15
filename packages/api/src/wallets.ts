import { z } from 'zod'
import { recordId } from './records.ts'

// Epic 1 (WAL): wallets and the transactions that make up their balances. Both live in
// encrypted records (SEC-01), so the server never learns a wallet's name, type,
// currency or balance.

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
})
export type WalletRecord = z.infer<typeof walletRecord>

export const transactionRecordType = 'transaction'

// The kinds of transaction the wallets epic makes. The transactions epic (TXN) adds
// expenses, income and transfers, with categories and tags, in a later schema version.
export const transactionKinds = ['openingBalance', 'adjustment'] as const
export type TransactionKind = (typeof transactionKinds)[number]

export const transactionRecord = z.object({
  kind: z.enum(transactionKinds),
  walletId: recordId,
  date: calendarDate,
  // Integer minor units in the wallet's currency: positive adds to the balance,
  // negative takes from it (WAL-06). Never a float; z.int() keeps it a safe integer.
  amount: z.int(),
  note: z.string().max(500).optional(),
})
export type TransactionRecord = z.infer<typeof transactionRecord>
