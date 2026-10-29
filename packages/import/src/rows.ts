import type { ColumnSettings } from './columns.ts'
import { typeOf } from './columns.ts'
import type { Table } from './csv.ts'
import { readAmount, readDate, readTags } from './values.ts'

// IMP-08, IMP-10: each line of the file read with the column settings. A line that
// can't be read keeps its problem instead of a guess, so the review can show it.

export type RowProblem = 'date' | 'amount' | 'zero' | 'currency'

export interface ImportRow {
  /** The line in the file, counting the header as line 1, for "Row 1,207". */
  line: number
  date: string | null
  /** Signed minor units: negative takes money out of the wallet (WAL-06). */
  amount: number | null
  currency: string
  /** What a type column says the row is; null when the file doesn't say. */
  kind: 'expense' | 'income' | 'transfer' | null
  /** IMP-22: the rows of one transfer share this id; '' without one. */
  transferId: string
  /** The file marks it as a transfer, by its type or a transfer id (IMP-22). */
  transfer: boolean
  payee: string
  note: string
  wallet: string
  category: string
  group: string
  tags: string[]
  problem: RowProblem | null
  /** The line as written, to show a row that couldn't be read (IMP-33). */
  text: string
}

export function readRows(table: Table, settings: ColumnSettings, defaultCurrency: string) {
  const index = (field: ColumnSettings['columns'][number]) => settings.columns.indexOf(field)
  const at = {
    date: index('date'),
    amount: index('amount'),
    inflow: index('inflow'),
    outflow: index('outflow'),
    type: index('type'),
    transferId: index('transferId'),
    payee: index('payee'),
    note: index('note'),
    wallet: index('wallet'),
    category: index('category'),
    group: index('group'),
    tags: index('tags'),
    currency: index('currency'),
  }
  const cell = (row: readonly string[], column: number) =>
    column < 0 ? '' : (row[column] ?? '').trim()

  return table.rows.map((row, position): ImportRow => {
    const currencyText = cell(row, at.currency).toUpperCase()
    const currency = currencyText === '' ? defaultCurrency : currencyText
    const validCurrency = /^[A-Z]{3}$/.test(currency)
    const read = (column: number) =>
      validCurrency ? readAmount(cell(row, column), settings.decimalMark, currency) : null

    const type = at.type < 0 ? null : typeOf(cell(row, at.type))
    let amount: number | null = null
    if (at.amount >= 0) {
      const value = read(at.amount)
      if (value !== null) {
        // A type column decides the direction whatever the sign says. A transfer goes
        // both ways, so each of its rows keeps the sign it has.
        if (type === 'income') amount = Math.abs(value)
        else if (type === 'expense') amount = -Math.abs(value)
        else amount = settings.amountSign === 'negativeIsExpense' ? value : -value
      }
    }
    if (amount === null && (at.inflow >= 0 || at.outflow >= 0)) {
      const inflow = cell(row, at.inflow) === '' ? 0 : read(at.inflow)
      const outflow = cell(row, at.outflow) === '' ? 0 : read(at.outflow)
      if (inflow !== null && outflow !== null) amount = Math.abs(inflow) - Math.abs(outflow)
    }
    const date = readDate(cell(row, at.date), settings.dateOrder)
    const problem: RowProblem | null = !validCurrency
      ? 'currency'
      : date === null
        ? 'date'
        : amount === null
          ? 'amount'
          : amount === 0
            ? 'zero'
            : null
    const transferId = cell(row, at.transferId)
    return {
      line: position + 2,
      date,
      amount,
      currency,
      kind: type,
      transferId,
      transfer: type === 'transfer' || transferId !== '',
      payee: cell(row, at.payee),
      note: cell(row, at.note),
      wallet: cell(row, at.wallet),
      category: cell(row, at.category),
      group: cell(row, at.group),
      tags: readTags(cell(row, at.tags)),
      problem,
      text: row
        .map((value) => value.trim())
        .filter((value) => value !== '')
        .join(' · ')
        .slice(0, 300),
    }
  })
}
