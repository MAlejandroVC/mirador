import type { RecurringRecord, WalletRecord } from '@repo/api'
import type { Category, Transaction } from '@repo/core'
import { describe, expect, it } from 'vitest'
import { buildImport, defaultDecisions, type RecordChange, undoImport } from './build.ts'
import { linkWallets, type PlanLedger, planRows } from './plan.ts'
import { readRows } from './rows.ts'
import { readBox, readStatement, type TextPage, type TextWord } from './statement.ts'
import { guessStatementColumns } from './statement-columns.ts'
import { applyUpdates, walletUpdates } from './updates.ts'

// A made-up card statement (no real data): charges in one column, a payment as a
// negative, two installment marks, and the card's dates and limit in its heading.
function page(lines: (readonly [number, string])[][]): TextPage {
  const words: TextWord[] = []
  lines.forEach((line, row) => {
    for (const [x, text] of line)
      words.push({ text, x, y: 40 + row * 20, width: text.length * 7, height: 12, confidence: 1 })
  })
  return { width: 600, height: 800, words }
}
const right = (end: number, text: string) => [end - text.length * 7, text] as const
const dataOf = (change: RecordChange | undefined): unknown =>
  change && !change.body.deleted ? change.body.data : undefined

const card = page([
  [[20, 'BANCO EJEMPLO']],
  [[20, 'Periodo 28 SEP 2026 - 27 OCT 2026']],
  [
    [20, 'Fecha limite de pago'],
    [300, '16/11/2026'],
  ],
  [[20, 'Limite de credito'], right(560, '40,000.00')],
  [[20, 'Pago minimo'], right(560, '1,250.00')],
  [[20, 'Saldo al corte'], right(560, '8,412.30')],
  [[20, 'FECHA'], [90, 'DESCRIPCION'], right(560, 'IMPORTE')],
  [[20, '02 OCT'], [90, 'TIENDA LA ESQUINA REF 4482910'], right(560, '85.00')],
  [[20, '03 OCT'], [90, 'ALMACENES LUNA MSI 03/12'], right(560, '416.58')],
  [[20, '05 OCT'], [90, 'STREAMBOX'], right(560, '219.00')],
  [[20, '07 OCT'], [90, 'SUPERMERCADO LA HUERTA'], right(560, '1,236.40')],
  [[20, '09 OCT'], [90, 'CORNER MARKET MSI 01/06'], right(560, '1,500.00')],
  [[20, '12 OCT'], [90, 'PAGO GRACIAS'], right(560, '-5,000.00')],
  [[20, '15 OCT'], [90, 'FARMACIA DEL CENTRO'], right(560, '348.00')],
  [[20, '16 OCT'], [90, 'COMISION ANUALIDAD'], right(560, '650.00')],
])

let counter = 0
const newId = () => {
  counter += 1
  return `0190b000-0000-7000-8000-${String(counter).padStart(12, '0')}`
}
const walletId = newId()
const streamId = newId()
const other: Category = {
  id: newId(),
  name: 'Uncategorized',
  groupId: newId(),
  kind: 'any',
  icon: 'questionMark',
  flexibility: 'flexible',
  systemKey: 'uncategorized',
}
const wallet: WalletRecord & { id: string } = {
  id: walletId,
  name: 'Banco Ejemplo',
  preset: 'creditCard',
  currency: 'MXN',
  icon: 'creditCard',
  color: 'lake',
  features: ['interest'],
  active: true,
  inNetWorth: true,
  inBudget: true,
  order: 0,
}

function ledger(transactions: Transaction[] = []): PlanLedger & { tags: [] } {
  return {
    wallets: [{ id: walletId, name: 'Banco Ejemplo', currency: 'MXN' }],
    groups: [],
    categories: [other],
    payees: [{ id: streamId, name: 'Streambox' }],
    transactions,
    tags: [],
  }
}

function prepare(current = ledger()) {
  const table = readStatement([card], { year: 2026 })
  const settings = guessStatementColumns(table)
  const rows = readRows(table, settings, 'MXN')
  const wallets = linkWallets(rows, current, walletId, 'MXN')
  const planned = planRows(rows, current, wallets, () => 'MXN')
  return { table, settings, rows, wallets, planned }
}

describe('reading a statement', () => {
  it('IMP-13: tells a card statement charges column from a bank one, with no header word', () => {
    const { settings, rows } = prepare()
    expect(settings.columns).toEqual(['date', 'payee', 'amount'])
    expect(settings.amountSign).toBe('positiveIsExpense')
    expect(rows.find((row) => row.payee === 'PAGO GRACIAS')?.amount).toBe(500_000)
    expect(rows.find((row) => row.payee === 'STREAMBOX')?.amount).toBe(-21_900)
  })

  it('IMP-13: keeps reference numbers out of the payee, as the note', () => {
    const { rows } = prepare()
    expect(rows[0]).toMatchObject({ payee: 'TIENDA LA ESQUINA', note: 'REF 4482910' })
  })

  it('IMP-40: knows where each field of a row is on the page', () => {
    const { table } = prepare()
    const fields = table.sources[1]?.fields
    expect(fields?.date?.x).toBeCloseTo(20 / 600)
    expect(fields?.installment).toBeDefined()
    expect(fields?.payee?.x).toBeCloseTo(90 / 600)
    expect(fields?.amount?.x).toBeGreaterThan(0.8)
  })

  it('IMP-39: reads the closing day, due date, limit and minimum from the heading', () => {
    const { table } = prepare()
    expect(table.facts?.closing?.value).toBe('2026-10-27')
    expect(table.facts?.due?.value).toBe('2026-11-16')
    expect(table.facts?.limit?.value).toBe('40,000.00')
    expect(table.facts?.minimum?.value).toBe('1,250.00')
    expect(table.facts?.balance?.value).toBe('8,412.30')
  })

  it('IMP-40: reads a row from a box drawn around it', () => {
    const row = readBox(
      card,
      { x: 0, y: (40 + 14 * 20 - 2) / 800, width: 1, height: 16 / 800 },
      {
        year: 2026,
      },
    )
    expect(row).toEqual({
      date: '2026-10-16',
      payee: 'COMISION ANUALIDAD',
      amount: '650.00',
      installment: null,
    })
  })
})

describe('installments', () => {
  it('IMP-28: month 1 of a mark becomes a new purchase in installments', () => {
    const { planned, wallets } = prepare()
    const row = planned.find((item) => item.row.payee === 'CORNER MARKET')
    expect(row?.status).toEqual({ kind: 'plan', month: 1, months: 6 })
    const result = buildImport({
      planned,
      wallets,
      categories: [],
      decisions: defaultDecisions(planned),
      ledger: ledger(),
      uncategorizedId: other.id,
      file: { name: 'october.pdf', source: 'statement' },
      newWallet: () => wallet,
      names: { wallet: 'Imported', group: 'Imported' },
      newId,
      now: new Date('2026-11-01T12:00:00Z'),
    })
    const purchases = result.changes
      .map((change) => dataOf(change) as { amount?: number; installments?: unknown; date?: string })
      .filter((data) => data.installments)
    // Month 3 of 12 of a plan Mirador doesn't have: bought two months before.
    expect(purchases).toEqual([
      expect.objectContaining({
        amount: -499_896,
        date: '2026-08-03',
        installments: { months: 12 },
      }),
      expect.objectContaining({
        amount: -900_000,
        date: '2026-10-09',
        installments: { months: 6 },
      }),
    ])
  })

  it('IMP-28: a later month of a plan already in the wallet is skipped', () => {
    const plan: Transaction = {
      id: newId(),
      kind: 'expense',
      walletId,
      date: '2026-08-02',
      amount: -499_896,
      categoryId: other.id,
      installments: { months: 12 },
    }
    const { planned } = prepare(ledger([plan]))
    const row = planned.find((item) => item.row.payee === 'ALMACENES LUNA')
    expect(row?.status).toEqual({ kind: 'installment', planId: plan.id, month: 3, months: 12 })
  })
})

describe('wallet updates', () => {
  const streambox: RecurringRecord & { id: string } = {
    id: newId(),
    kind: 'expense',
    walletId,
    amount: -21_900,
    payeeId: streamId,
    start: '2026-01-05',
    every: { unit: 'month', count: 1 },
    until: '2026-08-05',
    handled: '2026-08-05',
  }

  it('IMP-39, IMP-29: offers the card settings it shows and a recurring that still charges', () => {
    const { planned, table } = prepare()
    const updates = walletUpdates({
      wallet,
      facts: table.facts,
      planned,
      recurring: [streambox],
      payees: ledger().payees,
      decimalMark: '.',
    })
    expect(updates).toEqual([
      { kind: 'closingDay', before: null, after: 27 },
      { kind: 'dueDay', before: null, after: 16 },
      { kind: 'limit', before: null, after: 4_000_000 },
      {
        kind: 'recurring',
        recurringId: streambox.id,
        until: '2026-08-05',
        date: '2026-10-05',
        amount: -21_900,
      },
    ])
  })

  it('IMP-42: undoing everything puts the settings back; undoing transactions keeps them', () => {
    const { planned, table, wallets } = prepare()
    const updates = walletUpdates({
      wallet,
      facts: table.facts,
      planned,
      recurring: [streambox],
      payees: ledger().payees,
      decimalMark: '.',
    })
    const applied = applyUpdates(updates, wallet, [streambox])
    const saved = applied.changes.map(dataOf) as [WalletRecord, RecurringRecord]
    expect(saved[0].credit).toEqual({ closingDay: 27, dueDay: 16, limit: 4_000_000 })
    expect(saved[0].features).toContain('creditLimit')
    // Back on, with October's charge as this month's.
    expect(saved[1].until).toBeUndefined()
    expect(saved[1].handled).toBe('2026-10-05')

    const result = buildImport({
      planned,
      wallets,
      categories: [],
      decisions: defaultDecisions(planned),
      ledger: ledger(),
      uncategorizedId: other.id,
      file: { name: 'october.pdf', source: 'statement' },
      newWallet: () => wallet,
      names: { wallet: 'Imported', group: 'Imported' },
      newId,
      now: new Date('2026-11-01T12:00:00Z'),
      settings: applied.settings,
    })
    const records = {
      wallets: [{ ...saved[0], id: walletId }],
      recurring: [{ ...saved[1], id: streambox.id }],
    }
    const base = {
      transactions: [],
      categories: [],
      recurring: [],
      typeOf: () => undefined,
      records,
    }
    const everything = undoImport(result.batchId, result.batch, base)
    const restored = dataOf(
      everything.changes.find((change) => change.id === walletId),
    ) as WalletRecord
    expect(restored.credit).toBeUndefined()
    expect(restored.features).toEqual(['interest'])
    const recurring = dataOf(
      everything.changes.find((change) => change.id === streambox.id),
    ) as RecurringRecord
    expect(recurring).toMatchObject({ until: '2026-08-05', handled: '2026-08-05' })

    const transactionsOnly = undoImport(result.batchId, result.batch, base, { keepSettings: true })
    expect(transactionsOnly.changes.map((change) => change.id)).toEqual([result.batchId])
  })
})
