import { z } from 'zod'
import { recordId } from './records.ts'
import { calendarDate } from './wallets.ts'

// TXN-09, TXN-10: a recurring transaction, the template that adds the same expense,
// income or transfer on a schedule. It lives in an encrypted record (SEC-01) like the
// transactions it adds, which the device adds when it opens: the server can't.

export const recurringRecordType = 'recurring'

export const repeatUnits = ['day', 'week', 'month', 'year'] as const
export type RepeatUnit = (typeof repeatUnits)[number]

export const recurringRecord = z
  .object({
    kind: z.enum(['expense', 'income', 'transfer']),
    // What each one adds, as a transaction has it (see transactions.ts).
    walletId: recordId,
    amount: z.int(),
    note: z.string().max(500).optional(),
    toWalletId: recordId.optional(),
    toAmount: z.int().positive().optional(),
    rate: z.int().positive().optional(),
    categoryId: recordId.optional(),
    // CAT-24: a recurring transaction can carry tags.
    tagIds: z.array(recordId).max(50).optional(),
    payeeId: recordId.optional(),
    excludeFromBudget: z.boolean().optional(),
    // The first date, then every `count` days, weeks, months or years. A month keeps
    // the first date's day, or the month's last day when it is shorter.
    start: calendarDate,
    every: z.object({ unit: z.enum(repeatUnits), count: z.int().min(1).max(99) }),
    // It ends on a date, after a number of times, or never.
    until: calendarDate.optional(),
    times: z.int().min(1).max(999).optional(),
    // TXN-10: wait for the person to check each one, rather than adding it.
    ask: z.boolean().optional(),
    // The last date added or skipped; the next ones come after it.
    handled: calendarDate.optional(),
    createdAt: z.iso.datetime().optional(),
    updatedAt: z.iso.datetime().optional(),
  })
  .superRefine((record, context) => {
    const issue = (message: string) => {
      context.addIssue({ code: 'custom', message })
    }
    if (record.kind === 'income' ? record.amount <= 0 : record.amount >= 0)
      issue('The amount goes the way its type does')
    if (record.kind === 'transfer') {
      if (record.toWalletId === undefined || record.toAmount === undefined)
        issue('A transfer needs where it goes and what arrives')
      if (record.toWalletId === record.walletId) issue('A transfer goes to another wallet')
      if (record.categoryId !== undefined) issue('A transfer has no category')
    } else if (record.toWalletId !== undefined || record.toAmount !== undefined)
      issue('Only a transfer goes to another wallet')
    if (record.until !== undefined && record.times !== undefined)
      issue('It ends on a date or after a number of times, not both')
    if (record.until !== undefined && record.until < record.start) issue('It ends after it starts')
  })
export type RecurringRecord = z.infer<typeof recurringRecord>
