import {
  type DateOrder,
  type DecimalMark,
  guessDateOrder,
  guessDecimalMark,
  nameKey,
} from './values.ts'

// IMP-02, DAT-12: what each column of a CSV holds. Mirador guesses it from the header
// and the cells, in English and Spanish, so most files need no change; the person can
// fix any guess, and the choice is remembered for files with the same columns (IMP-03).

export const columnFields = [
  'date',
  'amount',
  'inflow',
  'outflow',
  'type',
  'transferId',
  'payee',
  'note',
  'wallet',
  'category',
  'group',
  'tags',
  'currency',
  'skip',
] as const
export type ColumnField = (typeof columnFields)[number]

/** How a single amount column says which way money went. */
export type AmountSign = 'negativeIsExpense' | 'positiveIsExpense'

export interface ColumnSettings {
  columns: ColumnField[]
  dateOrder: DateOrder
  decimalMark: DecimalMark
  amountSign: AmountSign
}

// Header words, compared as nameKey(). The first field whose words match wins.
const headerWords: [ColumnField, string[]][] = [
  ['date', ['date', 'fecha', 'day', 'dia', 'posted', 'transaction date', 'fecha operacion']],
  ['inflow', ['inflow', 'credit', 'deposit', 'deposito', 'abono', 'ingreso', 'entrada', 'in']],
  ['outflow', ['outflow', 'debit', 'withdrawal', 'retiro', 'cargo', 'egreso', 'salida', 'out']],
  ['amount', ['amount', 'monto', 'importe', 'cantidad', 'value', 'valor', 'total', 'sum']],
  ['type', ['type', 'tipo', 'kind', 'transaction type', 'direction']],
  [
    'transferId',
    ['transfer id', 'transfer pair', 'pair id', 'id transferencia', 'id de transferencia'],
  ],
  [
    'payee',
    [
      'payee',
      'merchant',
      'description',
      'descripcion',
      'concepto',
      'comercio',
      'beneficiario',
      'name',
      'nombre',
    ],
  ],
  ['note', ['note', 'notes', 'nota', 'notas', 'memo', 'comment', 'comentario', 'detalle']],
  ['wallet', ['wallet', 'account', 'cuenta', 'billetera', 'cartera', 'card', 'tarjeta']],
  ['group', ['category group', 'head category', 'group', 'grupo', 'parent category']],
  ['category', ['category', 'categoria', 'subcategory', 'subcategoria']],
  ['tags', ['tags', 'tag', 'etiquetas', 'etiqueta', 'labels']],
  ['currency', ['currency', 'moneda', 'divisa']],
  ['skip', ['balance', 'saldo', 'running balance', 'id', 'reference', 'referencia']],
]

function fieldOfHeader(header: string): ColumnField | null {
  const key = nameKey(header)
  for (const [field, words] of headerWords) if (words.includes(key)) return field
  return null
}

/** The fields that can hold only one column each; the rest repeat as Skip. */
const single = new Set<ColumnField>(columnFields.filter((field) => field !== 'skip'))

export function guessColumns(header: readonly string[], rows: readonly string[][]): ColumnSettings {
  const columns: ColumnField[] = []
  const taken = new Set<ColumnField>()
  for (const name of header) {
    const field = fieldOfHeader(name)
    if (field && !(single.has(field) && taken.has(field))) {
      columns.push(field)
      taken.add(field)
    } else columns.push('skip')
  }
  // A file without a header word for the date or amount: the first column whose
  // cells all look like one.
  const cells = (index: number) => rows.slice(0, 50).map((row) => row[index] ?? '')
  const looksLike = (index: number, pattern: RegExp) => {
    const values = cells(index).filter((value) => value.trim() !== '')
    return values.length > 0 && values.every((value) => pattern.test(value.trim()))
  }
  if (!taken.has('date')) {
    const index = columns.findIndex(
      (field, i) => field === 'skip' && looksLike(i, /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/),
    )
    if (index >= 0) columns[index] = 'date'
  }
  if (!taken.has('amount') && !taken.has('inflow') && !taken.has('outflow')) {
    const index = columns.findIndex(
      (field, i) => field === 'skip' && looksLike(i, /^[-+(]?[^\d]{0,3}[\d.,\s]+\)?-?$/),
    )
    if (index >= 0) columns[index] = 'amount'
  }
  const valuesOf = (field: ColumnField) => {
    const index = columns.indexOf(field)
    return index < 0 ? [] : rows.map((row) => row[index] ?? '')
  }
  return {
    columns,
    dateOrder: guessDateOrder(valuesOf('date')),
    decimalMark: guessDecimalMark([
      ...valuesOf('amount'),
      ...valuesOf('inflow'),
      ...valuesOf('outflow'),
    ]),
    amountSign: 'negativeIsExpense',
  }
}

/** IMP-03: files with the same columns, in any case or accents, share a profile. */
export function headerKey(header: readonly string[]): string {
  return header.map(nameKey).join('|')
}

/** What the import still needs before it can read the rows. */
export function missingFields(columns: readonly ColumnField[]): ('date' | 'amount')[] {
  const missing: ('date' | 'amount')[] = []
  if (!columns.includes('date')) missing.push('date')
  if (!columns.includes('amount') && !columns.includes('inflow') && !columns.includes('outflow'))
    missing.push('amount')
  return missing
}

// The words a type column uses for each direction.
const typeWords: ['expense' | 'income' | 'transfer', string[]][] = [
  ['transfer', ['transfer', 'transferencia', 'traspaso', 'movimiento entre cuentas']],
  ['income', ['income', 'ingreso', 'deposit', 'deposito', 'abono', 'credit', 'in', 'entrada']],
  ['expense', ['expense', 'gasto', 'egreso', 'cargo', 'debit', 'retiro', 'out', 'salida']],
]

export function typeOf(text: string): 'expense' | 'income' | 'transfer' | null {
  const key = nameKey(text)
  for (const [type, words] of typeWords) if (words.includes(key)) return type
  return null
}
