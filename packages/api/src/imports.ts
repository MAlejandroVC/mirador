import { z } from 'zod'
import { recordId } from './records.ts'
import { calendarDate } from './wallets.ts'

// Epics 3 and 9 (IMP, DAT): what an import leaves behind. Both are encrypted records
// (SEC-01): the server never learns a file's name, its columns or what came in.

export const importBatchRecordType = 'importBatch'

/** IMP-10, IMP-33: why a row was left out, kept so the person can see it later. */
export const rowProblems = ['date', 'amount', 'zero', 'currency'] as const

export const importBatchRecord = z.object({
  /** `csv` for a file, `sample` for the made-up data that shows the app off. */
  source: z.enum(['csv', 'sample']),
  fileName: z.string().max(255),
  // IMP-36: the file's SHA-256, so the same file imported twice can be caught.
  fingerprint: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  importedAt: z.iso.datetime(),
  // IMP-34: the counts the batch is shown with.
  rows: z.int().nonnegative(),
  imported: z.int().nonnegative(),
  skipped: z.int().nonnegative(),
  // IMP-35: everything besides transactions the import created (wallets, groups,
  // categories, tags, payees), removed with it unless something else came to use them.
  // Transactions carry the batch's id themselves.
  created: z.array(recordId).max(5000),
  // IMP-21: transactions the person had logged that the file matched, with the date
  // each had before, so undoing puts it back.
  merged: z.array(z.object({ id: recordId, date: calendarDate })).max(20_000),
  // IMP-33: rows left for later, with why.
  waiting: z
    .array(
      z.object({
        line: z.int().positive(),
        problem: z.enum(rowProblems),
        text: z.string().max(300),
      }),
    )
    .max(2000),
})
export type ImportBatchRecord = z.infer<typeof importBatchRecord>

export const importProfileRecordType = 'importProfile'

/** IMP-02, IMP-03: how to read files with the same columns, remembered. */
export const importProfileRecord = z.object({
  headerKey: z.string().max(5000),
  columns: z
    .array(
      z.enum([
        'date',
        'amount',
        'inflow',
        'outflow',
        'type',
        'payee',
        'note',
        'wallet',
        'category',
        'group',
        'tags',
        'currency',
        'skip',
      ]),
    )
    .max(200),
  dateOrder: z.enum(['ymd', 'dmy', 'mdy']),
  decimalMark: z.enum(['.', ',']),
  amountSign: z.enum(['negativeIsExpense', 'positiveIsExpense']),
  // IMP-01: the wallet a file without a wallet column went into last time.
  walletId: recordId.optional(),
})
export type ImportProfileRecord = z.infer<typeof importProfileRecord>
