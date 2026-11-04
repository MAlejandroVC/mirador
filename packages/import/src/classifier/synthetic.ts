import type { ColumnLabel, ColumnSample, WordLabel } from './features.ts'
import { seeded } from './model.ts'

// Made-up statements to train and test the models: invented shops and banks in English
// and Spanish, laid out the many ways statements are, with installment marks and
// reference numbers written the ways people meet them. No real data (CONTRIBUTING).

type Random = () => number

const pick = <T>(random: Random, items: readonly T[]): T =>
  items[Math.floor(random() * items.length)] as T
const between = (random: Random, low: number, high: number) =>
  low + Math.floor(random() * (high - low + 1))
const pad = (value: number) => String(value).padStart(2, '0')

const shops = [
  'TIENDA LA ESQUINA',
  'FARMACIA DEL CENTRO',
  'SUPERMERCADO LA HUERTA',
  'GASOLINERA NORTE',
  'CAFE AURORA',
  'LIBRERIA EL PAPEL',
  'RESTAURANTE EL PATIO',
  'CINE ESTRELLA',
  'ALMACENES LUNA',
  'PANADERIA SAN JUAN',
  'TAQUERIA LOS ARCOS',
  'FERRETERIA DE LA PAZ',
  'MERCADO DE FLORES',
  'COMISION ANUALIDAD',
  'PAGO GRACIAS',
  'SU PAGO GRACIAS',
  'INTERESES DEL PERIODO',
  'TRANSFERENCIA SPEI',
  'DEPOSITO NOMINA',
  'RETIRO CAJERO',
  'BLUE HARBOR CAFE',
  'CORNER MARKET',
  'CITY PHARMACY',
  'NORTHSIDE FUEL',
  'GREEN LEAF GROCERY',
  'METRO TRANSIT',
  'STREAMBOX',
  'MAPLE BOOKS',
  'SUNRISE BAKERY',
  'HILLTOP HARDWARE',
  'PAYMENT THANK YOU',
  'ANNUAL FEE',
  'INTEREST CHARGE',
  'ONLINE TRANSFER',
  'PAYROLL DEPOSIT',
  'ATM WITHDRAWAL',
  'RIDESHARE *TRIP',
  'MUSICBOX.COM',
  'SHOPMART MX',
  'Cafe Aurora',
  'Corner Market',
  'Maple Books',
  'Tienda La Esquina',
]
const places = ['GDL', 'CDMX', 'MTY', 'INSURGENTES', 'NORTE', 'CENTRO', 'POLANCO', 'NY', 'SF']
const placesWithDigits = ['SUC 24', 'TIENDA 7', 'PLAZA 2000', 'STORE 12']

function installmentWords(random: Random): string[] {
  const months = pick(random, [3, 6, 6, 9, 12, 12, 18, 24])
  const month = between(random, 1, months)
  const long = random() < 0.6
  const a = long ? pad(month) : String(month)
  const b = long ? pad(months) : String(months)
  return pick(random, [
    () => ['MSI', `${a}/${b}`],
    () => [`${a}/${b}`, 'MSI'],
    () => ['MSI', a, 'DE', b],
    () => [a, 'DE', b, 'MSI'],
    () => ['MESES', 'SIN', 'INTERESES', `${a}/${b}`],
    () => ['PARC', `${a}/${b}`],
    () => ['PARCIALIDAD', a, 'DE', b],
    () => ['CUOTA', `${a}/${b}`],
    () => ['CUOTA', a, 'DE', b],
    () => ['PAGO', a, 'DE', b],
    () => ['INSTALLMENT', `${a}/${b}`],
    () => ['INST', a, 'OF', b],
    () => ['PLAN', `${a}/${b}`],
    () => [`${a}/${b}`],
    () => [`(${a}/${b})`],
  ])()
}

function referenceWords(random: Random): string[] {
  const digits = (count: number) =>
    Array.from({ length: count }, () => String(between(random, 0, 9))).join('')
  return pick(random, [
    () => ['REF', digits(between(random, 6, 10))],
    () => [`REF:${digits(7)}`],
    () => ['AUT', digits(6)],
    () => [`*${digits(4)}`],
    () => [`#${digits(between(random, 3, 5))}`],
    () => ['FOLIO', digits(between(random, 5, 8))],
    () => [digits(between(random, 8, 12))],
    () => [digits(4)],
    () => ['ID', digits(5)],
    () => [`TRX-${digits(6)}`],
    () => ['RFC', `ABC${digits(6)}XY${digits(1)}`],
  ])()
}

/** One row's description, each word with what it is. */
export function syntheticDescription(random: Random): { word: string; label: WordLabel }[] {
  const payee = pick(random, shops)
    .split(' ')
    .map((word) => ({ word, label: 'payee' as const }))
  if (random() < 0.3) payee.push({ word: pick(random, places), label: 'payee' })
  if (random() < 0.08)
    for (const word of pick(random, placesWithDigits).split(' '))
      payee.push({ word, label: 'payee' })
  const parts: { word: string; label: WordLabel }[][] = [payee]
  if (random() < 0.35) {
    const reference = referenceWords(random).map((word) => ({ word, label: 'reference' as const }))
    if (random() < 0.15) parts.unshift(reference)
    else parts.push(reference)
  }
  if (random() < 0.3) {
    const mark = installmentWords(random).map((word) => ({ word, label: 'installment' as const }))
    parts.splice(between(random, 1, parts.length), 0, mark)
  }
  return parts.flat()
}

/** A statement's amount columns, each with what it holds. */
export function syntheticColumns(random: Random): { sample: ColumnSample; label: ColumnLabel }[] {
  const layout = pick(random, [
    { kind: 'card', headers: [['IMPORTE', 'CARGO', 'MONTO', 'AMOUNT', 'CARGOS', '']] },
    {
      kind: 'card2',
      headers: [
        ['CARGOS', 'CHARGES', 'CARGO', 'PURCHASES', 'DEBITOS'],
        ['ABONOS', 'PAYMENTS', 'ABONO', 'CREDITS', 'PAGOS'],
      ],
    },
    { kind: 'bank', headers: [['IMPORTE', 'AMOUNT', 'MONTO', 'MOVIMIENTO', '']] },
    {
      kind: 'bank2',
      headers: [
        ['RETIROS', 'WITHDRAWALS', 'DEBITS', 'CARGOS', 'DEBIT', ''],
        ['DEPOSITOS', 'DEPOSITS', 'CREDITS', 'ABONOS', 'CREDIT', ''],
        ['SALDO', 'BALANCE', 'SALDO FINAL', ''],
      ],
    },
    {
      kind: 'bank1b',
      headers: [
        ['IMPORTE', 'AMOUNT', 'MONTO', ''],
        ['SALDO', 'BALANCE', ''],
      ],
    },
  ] as const)
  const rows = between(random, 6, 40)
  let balance = between(random, 1000, 900000) * 100
  const charge = () => between(random, 50, 300000) * (random() < 0.5 ? 1 : 100)
  const columns: (number | null)[][] = layout.headers.map(() => [])
  const credits: boolean[][] = layout.headers.map(() => [])
  const crStyle = random() < 0.3
  for (let row = 0; row < rows; row += 1) {
    const out = random() < (layout.kind.startsWith('card') ? 0.9 : 0.65)
    const value = charge()
    const push = (column: number, amount: number | null, credit = false) => {
      columns[column]?.push(amount)
      credits[column]?.push(credit)
    }
    if (layout.kind === 'card') {
      if (out) push(0, value)
      else push(0, crStyle ? value : -value, crStyle)
    } else if (layout.kind === 'card2' || layout.kind === 'bank2') {
      push(0, out ? value : null)
      push(1, out ? null : value)
      if (layout.kind === 'bank2') {
        balance += out ? -value : value
        push(2, balance)
      }
    } else {
      push(0, out ? -value : value)
      if (layout.kind === 'bank1b') {
        balance += out ? -value : value
        push(1, balance)
      }
    }
  }
  const labels: Record<(typeof layout)['kind'], ColumnLabel[]> = {
    card: ['charges'],
    card2: ['outflow', 'inflow'],
    bank: ['signed'],
    bank2: ['outflow', 'inflow', 'balance'],
    bank1b: ['signed', 'balance'],
  }
  return layout.headers.map((names, index) => {
    const label = labels[layout.kind][index] ?? 'balance'
    const header = random() < 0.2 ? '' : pick(random, names)
    return {
      label,
      sample: {
        header: header === '' ? `Amount ${String(index + 1)}` : header,
        values: columns[index] ?? [],
        credits: credits[index] ?? [],
        others: columns.filter((_, other) => other !== index),
        position: index,
      },
    }
  })
}

export { seeded }
