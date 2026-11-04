import { type ColumnLabel, labelColumn } from './classifier/index.ts'
import { type ColumnField, type ColumnSettings, guessColumns } from './columns.ts'
import type { StatementTable } from './statement.ts'
import { guessDateOrder, guessDecimalMark, readAmount } from './values.ts'

// IMP-02, IMP-04: what each column of a statement holds. A statement's first two
// columns are always its dates and descriptions (readStatement puts them there); the
// amount columns are told apart by the column model, from their header and how their
// values behave, so a statement in words nobody listed still reads right.

const fieldOf: Record<ColumnLabel, ColumnField> = {
  signed: 'amount',
  charges: 'amount',
  outflow: 'outflow',
  inflow: 'inflow',
  balance: 'skip',
}

/** "CR" after an amount: a credit, going the other way. */
export const creditMark = /\s?CR$/i

export function guessStatementColumns(table: StatementTable): ColumnSettings {
  const fallback = guessColumns(table.header, table.rows)
  const amountColumns = table.header.map((_, index) => index).slice(2)
  if (amountColumns.length === 0) return { ...fallback, installments: true }
  const decimalMark = guessDecimalMark(
    table.rows.flatMap((row) => amountColumns.map((index) => row[index] ?? '')),
  )
  const values = amountColumns.map((index) =>
    table.rows.map((row) => {
      const cell = (row[index] ?? '').trim()
      return cell === '' ? null : readAmount(cell.replace(creditMark, ''), decimalMark, 'USD')
    }),
  )
  const guesses = amountColumns.map((index, position) => ({
    index,
    ...labelColumn({
      header: table.header[index] ?? '',
      values: values[position] ?? [],
      credits: table.rows.map((row) => creditMark.test((row[index] ?? '').trim())),
      others: values.filter((_, other) => other !== position),
      position,
    }),
  }))
  const columns: ColumnField[] = table.header.map((_, index) =>
    index === 0 ? 'date' : index === 1 ? 'payee' : 'skip',
  )
  // A field holds one column: the surest guess gets it.
  const taken = new Set<ColumnField>()
  for (const guess of [...guesses].sort((a, b) => b.probability - a.probability)) {
    const field = fieldOf[guess.label]
    if (field === 'skip' || taken.has(field)) continue
    // One amount column, or a pair of outflow and inflow columns: never both.
    if (field === 'amount' && (taken.has('outflow') || taken.has('inflow'))) continue
    if (field !== 'amount' && taken.has('amount')) continue
    columns[guess.index] = field
    taken.add(field)
  }
  if (taken.size === 0) return { ...fallback, installments: true }
  const charges = guesses.some(
    (guess) => guess.label === 'charges' && columns[guess.index] === 'amount',
  )
  return {
    columns,
    dateOrder: guessDateOrder(table.rows.map((row) => row[0] ?? '')),
    decimalMark,
    // A card statement lists charges as they are and payments as credits.
    amountSign: charges ? 'positiveIsExpense' : 'negativeIsExpense',
    installments: true,
  }
}
