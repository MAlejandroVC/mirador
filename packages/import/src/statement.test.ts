import { describe, expect, it } from 'vitest'
import { guessColumns } from './columns.ts'
import { linkWallets, planRows } from './plan.ts'
import { readReceipt } from './receipt.ts'
import { readRows } from './rows.ts'
import { isAmount, readDateText, readStatement, type TextPage, type TextWord } from './statement.ts'

// A page drawn the way pdf.js or the OCR reports it: each line is [left, text] pairs at
// one height; words are 7 px a character, so right edges line up when the text does.
function page(lines: (readonly [number, string, number?])[][], width = 600): TextPage {
  const words: TextWord[] = []
  lines.forEach((line, row) => {
    for (const [x, text, confidence = 1] of line)
      words.push({ text, x, y: 40 + row * 20, width: text.length * 7, height: 12, confidence })
  })
  return { width, height: 800, words }
}

// Amounts end at 420 (charges), 500 (payments) and 580 (balance).
const right = (end: number, text: string) => [end - text.length * 7, text] as const

const october = page([
  [
    [20, 'BANCO EJEMPLO'],
    [400, 'Periodo 01/10/2026 al 31/10/2026'],
  ],
  [[20, 'Saldo anterior'], right(580, '10,250.00')],
  [
    [20, 'Fecha'],
    [90, 'Descripción'],
    right(420, 'Cargos'),
    right(500, 'Abonos'),
    right(580, 'Saldo'),
  ],
  [[20, '02/OCT'], [90, 'OXXO 1234 GDL'], right(420, '85.00'), right(580, '10,165.00')],
  [[20, '03/OCT'], [90, 'NOMINA EMPRESA'], right(500, '15,000.00'), right(580, '25,165.00')],
  [[20, '05/OCT'], [90, 'SPEI ENVIADO A JUAN'], right(420, '1,200.00'), right(580, '23,965.00')],
  [[90, 'REF 99812 RENTA OCTUBRE']],
  [[20, 'Página 1 de 2']],
])

const octoberTwo = page([
  [
    [20, 'Fecha'],
    [90, 'Descripción'],
    right(420, 'Cargos'),
    right(500, 'Abonos'),
    right(580, 'Saldo'),
  ],
  [[20, '14/OCT'], [90, 'FARMACIA GUADALAJARA'], right(420, '348.00'), right(580, '23,617.00')],
  [[20, 'Saldo final'], right(580, '23,617.00')],
])

describe('readStatement', () => {
  it('IMP-04: reads a multi-page statement into the rows of a table', () => {
    const table = readStatement([october, octoberTwo], { year: 2020 })
    expect(table.header).toEqual(['Fecha', 'Descripción', 'Cargos', 'Abonos', 'Saldo'])
    expect(table.rows).toEqual([
      ['2026-10-02', 'OXXO 1234 GDL', '85.00', '', '10,165.00'],
      ['2026-10-03', 'NOMINA EMPRESA', '', '15,000.00', '25,165.00'],
      ['2026-10-05', 'SPEI ENVIADO A JUAN REF 99812 RENTA OCTUBRE', '1,200.00', '', '23,965.00'],
      ['2026-10-14', 'FARMACIA GUADALAJARA', '348.00', '', '23,617.00'],
    ])
  })

  it('IMP-37: keeps the opening and closing balances it shows', () => {
    const table = readStatement([october, octoberTwo], { year: 2026 })
    expect(table.opening).toBe('10,250.00')
    expect(table.closing).toBe('23,617.00')
  })

  it('IMP-02: its columns are guessed like a CSV, so the wizard reads it unchanged', () => {
    const table = readStatement([october, octoberTwo], { year: 2026 })
    const settings = guessColumns(table.header, table.rows)
    expect(settings.columns).toEqual(['date', 'payee', 'outflow', 'inflow', 'skip'])
    const rows = readRows(table, settings, 'MXN')
    expect(rows.map((row) => [row.date, row.amount, row.payee])).toEqual([
      ['2026-10-02', -8500, 'OXXO 1234 GDL'],
      ['2026-10-03', 1_500_000, 'NOMINA EMPRESA'],
      ['2026-10-05', -120_000, 'SPEI ENVIADO A JUAN REF 99812 RENTA OCTUBRE'],
      ['2026-10-14', -34_800, 'FARMACIA GUADALAJARA'],
    ])
  })

  it('IMP-10: flags a date or an amount that was hard to read instead of trusting it', () => {
    const scan = page([
      [[20, 'Date'], [90, 'Description'], right(420, 'Amount')],
      [[20, '10/14/2026', 0.55], [90, 'UBER *TRIP'], right(420, '-96.40')],
      [
        [20, '10/15/2026'],
        [90, 'FARMACIA'],
        [420 - 7 * 7, '-348.00', 0.6],
      ],
      [[20, '10/16/2026'], [90, 'BLUE BOTTLE'], right(420, '-12.40')],
    ])
    const table = readStatement([scan], { year: 2026 })
    expect(table.sources.map((source) => source.unsure)).toEqual([['date'], ['amount'], []])
    expect(table.sources[0]?.page).toBe(0)
    expect(table.sources[0]?.box.y).toBeCloseTo(60 / 800)
  })

  it('IMP-05: works without a header, as on a screenshot of a banking app', () => {
    const shot = page(
      [
        [[16, 'Oct 20'], [90, 'Netflix'], right(380, '-$219.00')],
        [[16, 'Oct 19'], [90, 'Starbucks'], right(380, '-$85.00')],
        [[16, 'Oct 18'], [90, 'Payroll'], right(380, '$15,000.00')],
      ],
      390,
    )
    const table = readStatement([shot], { year: 2026 })
    expect(table.header).toEqual(['Date', 'Description', 'Amount'])
    expect(table.rows.map((row) => row[0])).toEqual(['2026-10-20', '2026-10-19', '2026-10-18'])
    const rows = readRows(table, guessColumns(table.header, table.rows), 'USD')
    expect(rows.map((row) => row.amount)).toEqual([-21_900, -8500, 1_500_000])
  })
})

describe('reading dates and amounts', () => {
  it('IMP-08: reads the ways statements write dates', () => {
    expect(readDateText('14/10/2026', 2026)).toBe('14/10/2026')
    expect(readDateText('14/10', 2026)).toBe('14/10/2026')
    expect(readDateText('2026-10-14', 2020)).toBe('2026-10-14')
    expect(readDateText('14 OCT', 2026)).toBe('2026-10-14')
    expect(readDateText('14/OCT/26', 2020)).toBe('2026-10-14')
    expect(readDateText('14-dic-2025', 2026)).toBe('2025-12-14')
    expect(readDateText('Oct 14, 2026', 2020)).toBe('2026-10-14')
    expect(readDateText('Enero 3', 2026)).toBe('2026-01-03')
    expect(readDateText('OXXO', 2026)).toBeNull()
    expect(readDateText('Total 3', 2026)).toBeNull()
  })

  it('IMP-08: tells amounts from reference numbers', () => {
    for (const text of [
      '85.00',
      '1,200.00',
      '-$219.00',
      '$15,000.00',
      '(12.50)',
      '348,00',
      '1.234,56',
      '96.40-',
      'MXN 85.00',
    ])
      expect(isAmount(text), text).toBe(true)
    for (const text of ['99812', '1234', '20/10/2026', 'OXXO', '4821'])
      expect(isAmount(text), text).toBe(false)
  })
})

describe('readReceipt', () => {
  const ticket = page(
    [
      [
        [120, 'OXXO'],
        [180, 'SUC 1234 GUADALAJARA'],
      ],
      [
        [120, '20/10/2026', 0.6],
        [220, '19:42'],
      ],
      [[60, 'AGUA 1L'], right(320, '18.00')],
      [[60, 'PAN BLANCO'], right(320, '52.50')],
      [[60, 'CAFE 400G'], right(320, '140.00')],
      [[60, 'SUBTOTAL'], right(320, '214.22')],
      [[60, 'IVA'], right(320, '34.28')],
      [[60, 'TOTAL'], right(320, '$248.50')],
      [[60, 'EFECTIVO'], right(320, '500.00')],
      [[60, 'CAMBIO'], right(320, '251.50')],
    ],
    380,
  )

  it('IMP-07: takes the total, the date and the shop from a ticket', () => {
    expect(readReceipt([ticket], { currency: 'MXN', today: '2026-10-21' })).toEqual({
      amount: 24_850,
      date: '2026-10-20',
      payee: 'OXXO',
      // The date was hard to read, so the sheet asks to check it (IMP-10).
      unsure: ['date'],
    })
  })

  it('IMP-07: reads a bank notification in one sentence', () => {
    const notice = page(
      [
        [[16, 'Banco Ejemplo']],
        [[16, 'Compra por $1,249.90 en LIVERPOOL PERISUR con tu tarjeta terminación 4821']],
      ],
      390,
    )
    expect(readReceipt([notice], { currency: 'MXN', today: '2026-10-21' })).toEqual({
      amount: 124_990,
      date: '2026-10-21',
      payee: 'LIVERPOOL PERISUR',
      unsure: [],
    })
    const english = page([[[16, 'You spent $12.40 at Blue Bottle on your card ending 4821']]], 390)
    expect(readReceipt([english], { currency: 'USD', today: '2026-10-21' })).toMatchObject({
      amount: 1240,
      payee: 'Blue Bottle',
    })
  })

  it('IMP-10: says when it found no amount instead of guessing', () => {
    const blurry = page([[[16, 'Gracias por su compra']]], 390)
    expect(readReceipt([blurry], { currency: 'MXN', today: '2026-10-21' })).toEqual({
      amount: null,
      date: '2026-10-21',
      payee: '',
      unsure: ['amount'],
    })
  })
})

describe('planning rows read from a picture', () => {
  it('IMP-10, IMP-31: puts a row with a field to check in front of the person', () => {
    const scan = page([
      [[20, 'Date'], [90, 'Description'], right(420, 'Amount')],
      [
        [20, '10/14/2026'],
        [90, 'UBER *TRIP'],
        [420 - 6 * 7, '-96.40', 0.4],
      ],
      [[20, '10/16/2026'], [90, 'BLUE BOTTLE'], right(420, '-12.40')],
    ])
    const table = readStatement([scan], { year: 2026 })
    const rows = readRows(table, guessColumns(table.header, table.rows), 'USD')
    const ledger = { wallets: [], groups: [], categories: [], payees: [], transactions: [] }
    const wallets = linkWallets(rows, ledger, null, 'USD')
    const planned = planRows(rows, ledger, wallets, () => 'USD')
    expect(planned.map((item) => item.status)).toEqual([
      { kind: 'check', fields: ['amount'] },
      { kind: 'noCategory' },
    ])
  })
})
