import {
  type ImportBatchRecord,
  type RecordBody,
  type RecurringRecord,
  recurringRecord,
  recurringRecordType,
  type WalletRecord,
  walletRecord,
  walletRecordType,
} from '@repo/api'
import type { RecordChange } from './build.ts'
import type { PlannedRow } from './plan.ts'
import type { StatementFacts } from './statement.ts'
import { type DecimalMark, nameKey, readAmount } from './values.ts'

// IMP-29, IMP-39: what a statement shows about its wallet that Mirador has differently:
// the card's closing day, due day and limit, and a recurring charge that was ended but
// still comes. Home works out what's due from these settings on its own (DSH-11); the
// statement only offers to put them right, each on by default, and the import keeps
// what they were so undoing it can put them back (IMP-42).

export type CreditField = 'closingDay' | 'dueDay' | 'limit'

export type WalletUpdate =
  | { kind: CreditField; before: number | null; after: number }
  | {
      kind: 'recurring'
      recurringId: string
      /** The day it ended, and the charge after it that shows it didn't. */
      until: string
      date: string
      amount: number
    }

type Wallet = WalletRecord & { id: string }
type Recurring = RecurringRecord & { id: string }

const dayOf = (date: string) => Number(date.slice(8, 10))

export function walletUpdates(input: {
  wallet: Wallet
  facts: StatementFacts | undefined
  planned: readonly PlannedRow[]
  recurring: readonly Recurring[]
  payees: readonly { id: string; name: string }[]
  decimalMark: DecimalMark
}): WalletUpdate[] {
  const { wallet, facts } = input
  const updates: WalletUpdate[] = []
  const found = {
    closingDay: facts?.closing ? dayOf(facts.closing.value) : null,
    dueDay: facts?.due ? dayOf(facts.due.value) : null,
    limit: facts?.limit
      ? Math.abs(readAmount(facts.limit.value, input.decimalMark, wallet.currency) ?? 0) || null
      : null,
  }
  const now = wallet.credit
  const credit: WalletUpdate[] = []
  for (const kind of ['closingDay', 'dueDay', 'limit'] as const) {
    const after = found[kind]
    const before = now?.[kind] ?? null
    if (after !== null && after !== before) credit.push({ kind, before, after })
  }
  // WAL-16: a card's settings are saved all three together, so a wallet without them
  // takes the statement's only when it shows all three.
  const complete = (['closingDay', 'dueDay', 'limit'] as const).every(
    (kind) => found[kind] !== null || now?.[kind] !== undefined,
  )
  if (complete) updates.push(...credit)

  const payees = new Map(input.payees.map((payee) => [payee.id, nameKey(payee.name)]))
  for (const recurring of input.recurring) {
    const { until } = recurring
    if (until === undefined || recurring.walletId !== wallet.id || recurring.kind !== 'expense')
      continue
    const name = recurring.payeeId ? payees.get(recurring.payeeId) : undefined
    const first = name?.split(' ')[0] ?? ''
    const charge = input.planned.find(
      ({ row, status }) =>
        row.amount === recurring.amount &&
        row.date !== null &&
        row.date > until &&
        status.kind !== 'unreadable' &&
        (first === '' || nameKey(row.payee).includes(first)),
    )
    if (charge?.row.date && charge.row.amount !== null)
      updates.push({
        kind: 'recurring',
        recurringId: recurring.id,
        until,
        date: charge.row.date,
        amount: charge.row.amount,
      })
  }
  return updates
}

const body = (type: string, data: unknown): RecordBody => ({
  deleted: false,
  type,
  schema: 1,
  data,
})

/** The records the chosen updates change, and what the import keeps to undo them. */
export function applyUpdates(
  updates: readonly WalletUpdate[],
  wallet: Wallet,
  recurring: readonly Recurring[],
): { changes: RecordChange[]; settings: ImportBatchRecord['settings'] } {
  if (updates.length === 0) return { changes: [], settings: undefined }
  const changes: RecordChange[] = []
  const changed: NonNullable<ImportBatchRecord['settings']>['changed'] = []
  const credit = { ...wallet.credit }
  for (const update of updates)
    if (update.kind !== 'recurring') {
      credit[update.kind] = update.after
      changed.push({
        kind: update.kind,
        ...(update.before !== null ? { before: update.before } : {}),
        after: update.after,
      })
    }
  const { id, ...fields } = wallet
  if (changed.length > 0 && credit.limit && credit.closingDay && credit.dueDay)
    changes.push({
      id,
      body: body(
        walletRecordType,
        walletRecord.parse({
          ...fields,
          credit,
          // WAL-12: a card's limit shows once the wallet has the feature.
          features: fields.features.includes('creditLimit')
            ? fields.features
            : [...fields.features, 'creditLimit'],
        }),
      ),
    })
  const resumed: NonNullable<ImportBatchRecord['settings']>['recurring'] = []
  for (const update of updates) {
    if (update.kind !== 'recurring') continue
    const record = recurring.find((item) => item.id === update.recurringId)
    if (!record?.until) continue
    const { id: recurringId, until, ...rest } = record
    resumed.push({ id: recurringId, until, ...(record.handled ? { handled: record.handled } : {}) })
    // The statement's charge is this month's, so the next one comes after it rather
    // than every month since it ended.
    const handled = !rest.handled || rest.handled < update.date ? update.date : rest.handled
    changes.push({
      id: recurringId,
      body: body(recurringRecordType, recurringRecord.parse({ ...rest, handled })),
    })
  }
  return {
    changes,
    settings: {
      walletId: wallet.id,
      ...(wallet.credit ? { credit: wallet.credit } : {}),
      features: [...wallet.features],
      changed: changes.some((change) => change.id === wallet.id) ? changed : [],
      recurring: resumed,
    },
  }
}

/**
 * IMP-42: "Undo everything" puts the wallet's card settings and the recurring
 * transactions back as they were before the import; nothing else they hold changes.
 */
export function undoSettings(
  settings: NonNullable<ImportBatchRecord['settings']>,
  wallet: Wallet | undefined,
  recurring: readonly Recurring[],
): RecordChange[] {
  const changes: RecordChange[] = []
  if (wallet && settings.changed.length > 0) {
    const { id, credit: _credit, ...fields } = wallet // eslint-disable-line @typescript-eslint/no-unused-vars
    changes.push({
      id,
      body: body(
        walletRecordType,
        walletRecord.parse({
          ...fields,
          ...(settings.credit ? { credit: settings.credit } : {}),
          features: settings.features,
        }),
      ),
    })
  }
  for (const before of settings.recurring) {
    const record = recurring.find((item) => item.id === before.id)
    if (!record) continue
    const { id, handled: _handled, ...fields } = record // eslint-disable-line @typescript-eslint/no-unused-vars
    changes.push({
      id,
      body: body(
        recurringRecordType,
        recurringRecord.parse({
          ...fields,
          until: before.until,
          ...(before.handled ? { handled: before.handled } : {}),
        }),
      ),
    })
  }
  return changes
}
