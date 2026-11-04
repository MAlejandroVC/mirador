import type { ImportBatchRecord } from '@repo/api'
import {
  type Box,
  type ColumnSettings,
  type Decisions,
  type PlannedRow,
  payeeWords,
  readAmount,
  type RowSource,
  type StatementFact,
} from '@repo/import'
import type { StatementFile } from './statement-review'

// IMP-37, IMP-40, IMP-42: the statement review's and the Imports screen's arithmetic,
// apart from what draws it.

type WaitingRow = ImportBatchRecord['waiting'][number]

/** What the import button brings in, as decided so far. */
export function importCount(planned: readonly PlannedRow[], decisions: Decisions) {
  return planned.reduce((sum, { row, status }) => {
    if (decisions.ignore?.has(row.line)) return sum
    switch (status.kind) {
      case 'ready':
      case 'noCategory':
      case 'plan':
        return sum + 1
      // IMP-10: rows to check come in as read; one with no date or amount waits.
      case 'check':
        return sum + (row.date !== null && row.amount !== null ? 1 : 0)
      case 'duplicate':
        return sum + (decisions.keep.has(row.line) ? 1 : 0)
      case 'transfer':
        return status.outgoing ? sum + (decisions.apart.has(row.line) ? 2 : 1) : sum
      default:
        return sum
    }
  }, 0)
}

/** The row's source on the page, and the picture of that page. */
export function sourceOf(file: StatementFile, line: number) {
  const source: RowSource | undefined = file.table.sources[line - 2]
  const image = source ? (file.pages?.[source.page] ?? null) : null
  return source && image ? { source, image } : null
}

/** An amount the statement gives, in minor units, as the person entered or as read. */
export function factMinor(
  fact: StatementFact | null | undefined,
  settings: ColumnSettings,
  currency: string,
) {
  if (!fact) return null
  if (fact.minor !== undefined) return fact.minor
  return readAmount(fact.value, settings.decimalMark, currency)
}

export interface Check {
  kind: 'balance' | 'charges' | 'credits'
  /** What the statement says, as a positive amount. */
  expected: number
  /** How far the rows are from it. */
  off: number
}

/**
 * IMP-37: whether the rows add up to what the statement says: its charges and its
 * payments and deposits each to their total, and all of them from the opening balance
 * to the closing one. Rows left out don't count; rows already in Mirador do, as they
 * are on the statement all the same.
 */
export function statementChecks(
  file: StatementFile,
  settings: ColumnSettings,
  planned: readonly PlannedRow[],
  currency: string,
  ignore?: ReadonlySet<number>,
): Check[] {
  const facts = file.table.facts
  const counted = planned.filter((item) => !ignore?.has(item.row.line))
  const out = counted.reduce((sum, item) => sum + Math.min(0, item.row.amount ?? 0), 0)
  const into = counted.reduce((sum, item) => sum + Math.max(0, item.row.amount ?? 0), 0)
  const checks: Check[] = []
  const charges = factMinor(facts?.charges, settings, currency)
  if (charges !== null)
    checks.push({
      kind: 'charges',
      expected: Math.abs(charges),
      off: Math.abs(Math.abs(charges) + out),
    })
  const credits = factMinor(facts?.credits, settings, currency)
  if (credits !== null)
    checks.push({
      kind: 'credits',
      expected: Math.abs(credits),
      off: Math.abs(Math.abs(credits) - into),
    })
  const start =
    factMinor(facts?.opening, settings, currency) ??
    (file.table.opening === null
      ? null
      : readAmount(file.table.opening, settings.decimalMark, currency))
  const end =
    factMinor(facts?.balance, settings, currency) ??
    (file.table.closing === null
      ? null
      : readAmount(file.table.closing, settings.decimalMark, currency))
  if (start !== null && end !== null) {
    const sum = out + into
    // A card counts the other way (charges add to what is owed): either way counts.
    checks.push({
      kind: 'balance',
      expected: Math.abs(end),
      off: Math.min(Math.abs(start + sum - end), Math.abs(start - sum - end)),
    })
  }
  return checks
}

/** A region of the page, a little wider than `box` so it reads in context. */
export function around(box: Box, padX = 0.015, padY = 0.012): Box {
  const x = Math.max(0, box.x - padX)
  const y = Math.max(0, box.y - padY)
  return {
    x,
    y,
    width: Math.min(1 - x, box.width + padX * 2),
    height: Math.min(1 - y, box.height + padY * 2),
  }
}

/**
 * IMP-40: the part of a page to show for a row: across its fields only, so the print
 * is large enough to read on a phone, with the rows above and below for context.
 */
export function rowRegion(row: Box, fields: readonly Box[], rowsAround: number) {
  const across = fields.length > 0 ? fields : [row]
  const left = Math.min(...across.map((box) => box.x))
  const right = Math.max(...across.map((box) => box.x + box.width))
  return around({ ...row, x: left, width: right - left }, 0.015, row.height * rowsAround)
}

/** Whether undoing it is a choice: it changed settings as well as adding transactions. */
export function changedSettings(batch: ImportBatchRecord) {
  return Boolean(
    batch.settings && (batch.settings.changed.length > 0 || batch.settings.recurring.length > 0),
  )
}

/** What the form starts with for a row left for later: whatever could be read. */
export function waitingSeed(row: WaitingRow) {
  return {
    type: row.amount !== undefined && row.amount > 0 ? ('income' as const) : ('expense' as const),
    ...(row.amount !== undefined ? { amount: Math.abs(row.amount) } : {}),
    ...(row.date ? { date: row.date } : {}),
    ...(row.walletId ? { walletId: row.walletId } : {}),
    ...(row.categoryId ? { categoryId: row.categoryId } : {}),
    ...(row.note ? { note: row.note } : {}),
  }
}

/**
 * IMP-23: the other rows a category picked for one row also fits: the same payee,
 * however the statement writes it, going the same way, with no category yet.
 */
export function samePayeeLines(
  planned: readonly PlannedRow[],
  line: number,
  decided: ReadonlyMap<number, string>,
): number[] {
  const item = planned.find((entry) => entry.row.line === line)
  if (!item) return []
  const [first] = payeeWords(item.row.payee)
  if (!first) return []
  const out = (item.row.amount ?? 0) < 0
  return planned.flatMap((other) =>
    other.row.line !== line &&
    !other.transfer &&
    other.categoryKey === null &&
    other.suggestedCategoryId === null &&
    !decided.has(other.row.line) &&
    (other.row.amount ?? 0) < 0 === out &&
    payeeWords(other.row.payee)[0] === first
      ? [other.row.line]
      : [],
  )
}

// IMP-09, IMP-40: what a statement row is, set the way quick add sets it (TXN-01).
export type RowKind = 'expense' | 'income' | 'transfer'

export interface KindState {
  kind: RowKind
  /** The other wallet of a transfer. */
  other: string | null
  /** Whether the money came into the statement's wallet. */
  into: boolean
}

/** The signed amount and transfer a row's kind gives its size, for a Fix. */
export function kindFix(state: KindState, size: number) {
  const into = state.kind === 'income' || (state.kind === 'transfer' && state.into)
  return {
    amount: into ? Math.abs(size) : -Math.abs(size),
    transferWith: state.kind === 'transfer' ? state.other : null,
  }
}
