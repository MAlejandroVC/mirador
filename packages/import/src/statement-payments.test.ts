import type { Category, Transaction } from '@repo/core'
import { describe, expect, it } from 'vitest'
import { buildImport, defaultDecisions } from './build.ts'
import { categorySuggester, linkWallets, type PlanLedger, planRows } from './plan.ts'
import { readRows } from './rows.ts'
import { factNamed, findLabeled, readStatement, type TextPage, type TextWord } from './statement.ts'
import { guessStatementColumns } from './statement-columns.ts'

// Made-up statements (no real data): a card that writes every amount without a sign,
// with its payment thanked for, and its totals in a summary.
function page(lines: (readonly [number, string])[][]): TextPage {
  const words: TextWord[] = []
  lines.forEach((line, row) => {
    for (const [x, text] of line)
      words.push({ text, x, y: 40 + row * 20, width: text.length * 7, height: 12, confidence: 1 })
  })
  return { width: 600, height: 800, words }
}
const right = (end: number, text: string) => [end - text.length * 7, text] as const

const card = page([
  [[20, 'TARJETA EJEMPLO']],
  [[20, 'Saldo anterior'], right(560, '4,000.00')],
  [[20, '(-) Pagos y abonos'], right(560, '4,000.00')],
  [[20, '(+) Cargos regulares (no a meses)'], right(560, '1,300.00')],
  [[20, '(+) Cargos a meses'], right(560, '500.00')],
  [[20, 'Saldo al corte'], right(560, '1,800.00')],
  [[20, 'FECHA'], [90, 'DESCRIPCION'], right(560, 'IMPORTE')],
  [[20, '02 OCT'], [90, 'OXXO GDL 1234'], right(560, '300.00')],
  [[20, '04 OCT'], [90, 'SU PAGO GRACIAS'], right(560, '4,000.00')],
  [[20, '06 OCT'], [90, 'ALMACENES LUNA MSI 02/06'], right(560, '500.00')],
  [[20, '09 OCT'], [90, 'INTERESES'], right(560, '1,000.00')],
])

let counter = 0
const newId = () => {
  counter += 1
  return `0190c000-0000-7000-8000-${String(counter).padStart(12, '0')}`
}
const cardId = newId()
const checkingId = newId()
const groupId = newId()
const category = (name: string, extra: Partial<Category> = {}): Category => ({
  id: newId(),
  name,
  groupId,
  kind: 'expense',
  icon: 'shoppingBag',
  flexibility: 'flexible',
  ...extra,
})
const uncategorized = category('Uncategorized', { kind: 'any', systemKey: 'uncategorized' })
const groceries = category('Groceries')
const interest = category('Interest', { systemKey: 'interest' })
const oxxoId = newId()

function ledger(transactions: Transaction[] = []): PlanLedger & { tags: [] } {
  return {
    wallets: [
      { id: cardId, name: 'Tarjeta', currency: 'MXN', features: ['creditLimit'], active: true },
      { id: checkingId, name: 'Débito', currency: 'MXN', features: [], active: true },
    ],
    groups: [],
    categories: [uncategorized, groceries, interest],
    payees: [{ id: oxxoId, name: 'Oxxo' }],
    transactions,
    tags: [],
    defaultWalletId: checkingId,
  }
}
const bought: Transaction = {
  id: newId(),
  kind: 'expense',
  walletId: checkingId,
  date: '2026-09-01',
  amount: -8_000,
  categoryId: groceries.id,
  payeeId: oxxoId,
}

function prepare(pages: TextPage[], current = ledger([bought])) {
  const table = readStatement(pages, { year: 2026 })
  const settings = guessStatementColumns(table)
  const rows = readRows(table, settings, 'MXN')
  const wallets = linkWallets(rows, current, cardId, 'MXN')
  const planned = planRows(rows, current, wallets, () => 'MXN')
  return { table, settings, rows, wallets, planned, current }
}

describe('statement totals', () => {
  it('IMP-37: reads the total of payments and adds up the charges split over the summary', () => {
    const { table } = prepare([card])
    expect(table.facts?.credits?.minor).toBe(400_000)
    expect(table.facts?.charges?.minor).toBe(180_000)
    expect(table.facts?.opening?.value).toBe('4,000.00')
    expect(table.facts?.balance?.value).toBe('1,800.00')
  })

  it('IMP-37: a line that says total is the total, whatever else the summary splits', () => {
    const { table } = prepare([
      page([
        [[20, 'Total cargos del periodo'], right(560, '2,100.00')],
        [[20, 'Cargos a meses'], right(560, '600.00')],
        [[20, 'Total depósitos'], right(560, '9,000.00')],
        [[20, '02/10/2026'], [90, 'CAFE AZUL'], right(560, '96.00')],
      ]),
    ])
    expect(table.facts?.charges?.minor).toBe(210_000)
    expect(table.facts?.credits?.minor).toBe(900_000)
  })

  it('IMP-37: names the fact a label in a drawn box gives', () => {
    expect(factNamed('TOTAL CARGOS')).toBe('charges')
    expect(factNamed('Pagos y abonos')).toBe('credits')
    expect(factNamed('Total deposits')).toBe('credits')
    expect(factNamed('Fecha límite de pago')).toBe('due')
    expect(factNamed('CAFE AZUL')).toBeNull()
  })

  it('IMP-14: finds a total by the label the person showed on an earlier statement', () => {
    const found = findLabeled(
      [page([[[20, 'SUMA DE MOVIMIENTOS DEL MES'], right(560, '3,456.70')]])],
      'charges',
      'suma de movimientos',
      { year: 2026, order: 'dmy' },
    )
    expect(found?.value).toBe('3,456.70')
    expect(found?.page).toBe(0)
  })
})

describe('payments', () => {
  it('IMP-09: a payment thanked for is money in, though the statement writes it unsigned', () => {
    const { rows, settings } = prepare([card])
    expect(settings.amountSign).toBe('positiveIsExpense')
    expect(rows.find((row) => row.payee === 'SU PAGO GRACIAS')).toMatchObject({
      amount: 400_000,
      payment: true,
    })
    expect(rows.find((row) => row.payee === 'OXXO GDL')?.amount).toBe(-30_000)
  })

  it('IMP-09: on a card, a payment comes in as a transfer from the wallet that paid it', () => {
    const { planned, wallets, current } = prepare([card])
    const payment = planned.find((item) => item.row.payee === 'SU PAGO GRACIAS')
    expect(payment?.transfer).toEqual({ walletId: checkingId, guessed: true })
    expect(payment?.suggestedCategoryId).toBeNull()
    const result = buildImport({
      planned,
      wallets,
      categories: [],
      decisions: defaultDecisions(planned),
      ledger: current,
      uncategorizedId: uncategorized.id,
      file: { name: 'card.pdf', source: 'statement' },
      newWallet: () => {
        throw new Error('no new wallets here')
      },
      names: { wallet: 'Imported', group: 'Imported' },
      newId,
      now: new Date('2026-11-04T12:00:00Z'),
    })
    const transfers = result.changes.flatMap((change) =>
      !change.body.deleted && (change.body.data as { kind?: string }).kind === 'transfer'
        ? [change.body.data]
        : [],
    )
    expect(transfers).toEqual([
      expect.objectContaining({
        walletId: checkingId,
        amount: -400_000,
        toWalletId: cardId,
        toAmount: 400_000,
        note: 'SU PAGO GRACIAS',
      }),
    ])
  })

  it('IMP-09: a payment the person already logged as a transfer is not brought in twice', () => {
    const logged: Transaction = {
      id: newId(),
      kind: 'transfer',
      walletId: checkingId,
      date: '2026-10-04',
      amount: -400_000,
      toWalletId: cardId,
      toAmount: 400_000,
    }
    const { planned } = prepare([card], ledger([bought, logged]))
    const payment = planned.find((item) => item.row.payee === 'SU PAGO GRACIAS')
    expect(payment?.status).toEqual({ kind: 'duplicate', matchId: logged.id })
  })

  it('IMP-40: a row the person said is not a transfer is not made one', () => {
    const { rows, wallets, current } = prepare([card])
    const changed = rows.map((row) =>
      row.payee === 'SU PAGO GRACIAS' ? { ...row, transferWith: null } : row,
    )
    const planned = planRows(changed, current, wallets, () => 'MXN')
    expect(planned.find((item) => item.row.payee === 'SU PAGO GRACIAS')?.transfer).toBeUndefined()
  })

  it('IMP-09: rows under a payments heading are money in, under a charges heading money out', () => {
    const { rows } = prepare([
      page([
        [[20, 'FECHA'], [90, 'DESCRIPCION'], right(560, 'IMPORTE')],
        [[20, 'Cargos']],
        [[20, '02 OCT'], [90, 'CAFE AZUL'], right(560, '96.00')],
        [[20, 'Pagos y abonos']],
        [[20, '05 OCT'], [90, 'DEVOLUCION TIENDA'], right(560, '120.00')],
      ]),
    ])
    expect(rows.map((row) => row.amount)).toEqual([-9_600, 12_000])
  })

  it('IMP-09: a lone heading is not trusted, as it may be a label over a summary total', () => {
    const { rows } = prepare([
      page([
        [[20, 'Pagos y abonos']],
        [[20, '4,000.00']],
        [[20, 'FECHA'], [90, 'DESCRIPCION'], right(560, 'IMPORTE')],
        [[20, '02 OCT'], [90, 'CAFE AZUL'], right(560, '96.00')],
        [[20, '03 OCT'], [90, 'PAN DEL DIA'], right(560, '45.00')],
      ]),
    ])
    expect(rows.every((row) => (row.amount ?? 0) < 0)).toBe(true)
  })
})

describe('category suggestions', () => {
  it('IMP-23: a payee written another way takes the category it had before', () => {
    const { planned } = prepare([card])
    expect(planned.find((item) => item.row.payee === 'OXXO GDL')?.suggestedCategoryId).toBe(
      groceries.id,
    )
  })

  it('IMP-23: interest charges go to the interest category', () => {
    const { planned } = prepare([card])
    expect(planned.find((item) => item.row.payee === 'INTERESES')?.suggestedCategoryId).toBe(
      interest.id,
    )
  })

  it('IMP-23: money in never takes the category of a store the person paid', () => {
    const suggest = categorySuggester(ledger([bought]))
    expect(suggest('OXXO GDL', 5_000)).toBeNull()
    expect(suggest('OXXO GDL', -5_000)).toBe(groceries.id)
  })

  it('IMP-23: a payee that only shares a filler word gets nothing', () => {
    const suggest = categorySuggester(ledger([bought]))
    expect(suggest('FARMACIA DEL CENTRO', -5_000)).toBeNull()
  })
})
