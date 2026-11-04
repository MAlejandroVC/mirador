import type { ImportBatchRecord } from '@repo/api'
import {
  type Box,
  type ColumnSettings,
  type Decisions,
  type PlannedRow,
  readAmount,
  type RowSource,
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

/** IMP-37: whether the rows add up to the balance the statement shows. */
export function balanceOff(
  file: StatementFile,
  settings: ColumnSettings,
  planned: readonly PlannedRow[],
  currency: string,
  ignore?: ReadonlySet<number>,
) {
  const { opening, closing } = file.table
  if (opening === null || closing === null) return null
  const start = readAmount(opening, settings.decimalMark, currency)
  const end = readAmount(closing, settings.decimalMark, currency)
  if (start === null || end === null) return null
  const sum = planned.reduce(
    (total, item) => total + (ignore?.has(item.row.line) ? 0 : (item.row.amount ?? 0)),
    0,
  )
  // A card counts the other way (charges add to what is owed): either way counts.
  return { off: Math.min(Math.abs(start + sum - end), Math.abs(start - sum - end)), end }
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
