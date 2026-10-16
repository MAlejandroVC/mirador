import { z } from 'zod'
import { recordId } from './records.ts'
import { calendarDate } from './wallets.ts'

// Epic 2 (TXN): transactions. Every one lives in an encrypted record (SEC-01), so the
// server never learns an amount, a date, a note or which wallets money moved between.

export const transactionRecordType = 'transaction'

// The kinds the wallets epic makes: the opening balance (WAL-05), adjustments (WAL-07),
// posted interest (WAL-14), confirmed fees (WAL-15) and market-value updates (WAL-18).
// Then the three a person records: expenses, income and transfers between their own
// wallets (TXN-01).
export const transactionKinds = [
  'openingBalance',
  'adjustment',
  'interest',
  'fee',
  'valuation',
  'expense',
  'income',
  'transfer',
] as const
export type TransactionKind = (typeof transactionKinds)[number]

/** Where a transaction came from (TXN fields: Source). */
export const transactionSources = ['manual', 'quickAdd', 'import', 'recurring'] as const
export type TransactionSource = (typeof transactionSources)[number]

export const transactionRecord = z
  .object({
    kind: z.enum(transactionKinds),
    walletId: recordId,
    date: calendarDate,
    // Integer minor units in the wallet's currency: positive adds to the balance,
    // negative takes from it (WAL-06). Never a float; z.int() keeps it a safe integer.
    // An expense and a transfer take from the wallet, income adds to it.
    amount: z.int(),
    note: z.string().max(500).optional(),
    // TXN-03, TXN-04: a transfer's destination and what it received there, in that
    // wallet's currency. TXN-05: between currencies, also the rate, in millionths of a
    // unit of the destination's currency per unit of the source's, like exchange rates.
    toWalletId: recordId.optional(),
    toAmount: z.int().positive().optional(),
    rate: z.int().positive().optional(),
    // CAT-20, TXN-15: an expense or income has one category and any number of tags;
    // a transfer has neither (TXN fields). Old records without a category show as
    // Uncategorized (CAT-05).
    categoryId: recordId.optional(),
    tagIds: z.array(recordId).max(50).optional(),
    payeeId: recordId.optional(),
    // TXN-06: left out of the budget; still in the wallet's balance.
    excludeFromBudget: z.boolean().optional(),
    source: z.enum(transactionSources).optional(),
    // The audit trail (TXN fields: Created and updated time), from the device's clock.
    createdAt: z.iso.datetime().optional(),
    updatedAt: z.iso.datetime().optional(),
  })
  .superRefine((record, context) => {
    const issue = (message: string) => {
      context.addIssue({ code: 'custom', message })
    }
    // TXN-01: the type sets the direction, so the sign always matches it.
    if (record.kind === 'expense' && record.amount >= 0) issue('An expense takes money out')
    if (record.kind === 'income' && record.amount <= 0) issue('Income puts money in')
    if (record.kind === 'transfer') {
      if (record.amount >= 0) issue('A transfer takes money out of its wallet')
      if (record.toWalletId === undefined || record.toAmount === undefined)
        issue('A transfer needs where it went and what arrived')
      if (record.toWalletId === record.walletId) issue('A transfer goes to another wallet')
      if (record.categoryId !== undefined) issue('A transfer has no category')
    } else if (
      record.toWalletId !== undefined ||
      record.toAmount !== undefined ||
      record.rate !== undefined
    )
      issue('Only a transfer goes to another wallet')
  })
export type TransactionRecord = z.infer<typeof transactionRecord>
