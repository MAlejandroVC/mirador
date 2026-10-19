import type { Category, CategoryGroup, Transaction } from '@repo/core'
import { describe, expect, it } from 'vitest'
import { buildImport, defaultDecisions, undoImport } from './build.ts'
import { guessColumns, headerKey, missingFields } from './columns.ts'
import { parseCsv } from './csv.ts'
import { linkCategories, linkWallets, type PlanLedger, planRows, summarize } from './plan.ts'
import { readRows } from './rows.ts'
import { guessDateOrder, readAmount, readDate } from './values.ts'

// Made-up rows in the shape of a Buddy export: ";" between cells, a category group
// ("Head category"), signed amounts and no wallet column.
const buddy = [
  'Date;Head category;Category;Note;Amount;Currency',
  '2026-07-18;Food & drinks;Groceries;Corner shop;-610.5;MXN',
  '2026-07-18;Food & drinks;Sweet Treat and Snacks;Bakery;-194;MXN',
  '2026-07-15;Income;Salary;Payroll;25000;MXN',
  '2026-07-12;Lifestyle;Pharmacy;;0;MXN',
  '2026-07-11;Transportation;Gas;Station;-800;MXN',
].join('\n')

let counter = 0
const newId = () => {
  counter += 1
  return `0190a000-0000-7000-8000-${String(counter).padStart(12, '0')}`
}

const groups: CategoryGroup[] = [{ id: newId(), name: 'Food & drinks', color: 'lake' }]
const groceries: Category = {
  id: newId(),
  name: 'Groceries',
  groupId: groups[0]!.id,
  kind: 'expense',
  icon: 'basket',
  flexibility: 'fixed',
}
const uncategorized: Category = {
  id: newId(),
  name: 'Uncategorized',
  groupId: groups[0]!.id,
  kind: 'any',
  icon: 'questionMark',
  flexibility: 'flexible',
  systemKey: 'uncategorized',
}
const walletId = newId()

function ledger(transactions: Transaction[] = []): PlanLedger & { tags: [] } {
  return {
    wallets: [{ id: walletId, name: 'BBVA Debit', currency: 'MXN' }],
    groups,
    categories: [groceries, uncategorized],
    payees: [],
    transactions,
    tags: [],
  }
}

function prepare(text: string, current = ledger()) {
  const table = parseCsv(text)
  const settings = guessColumns(table.header, table.rows)
  const rows = readRows(table, settings, 'MXN')
  const wallets = linkWallets(rows, current, walletId, 'MXN')
  const categories = linkCategories(rows, current)
  const planned = planRows(rows, current, wallets, () => 'MXN')
  return { table, settings, rows, wallets, categories, planned }
}

function build(text: string, current = ledger()) {
  const { planned, wallets, categories } = prepare(text, current)
  return buildImport({
    planned,
    wallets,
    categories,
    decisions: defaultDecisions(planned),
    ledger: current,
    uncategorizedId: uncategorized.id,
    file: { name: 'export.csv', source: 'csv' },
    newWallet: (target, name) => ({
      name,
      preset: target.preset,
      currency: target.currency,
      icon: 'wallet',
      color: 'stone',
      features: [],
      active: true,
      inNetWorth: true,
      inBudget: true,
    }),
    names: { wallet: 'Imported', group: 'Imported' },
    newId,
    now: new Date('2026-10-19T12:00:00Z'),
  })
}

describe('reading a CSV', () => {
  it('IMP-02: reads a semicolon file and guesses every column from its header', () => {
    const { table, settings } = prepare(buddy)
    expect(table.delimiter).toBe(';')
    expect(settings.columns).toEqual(['date', 'group', 'category', 'note', 'amount', 'currency'])
    expect(missingFields(settings.columns)).toEqual([])
  })

  it('IMP-02: reads quoted cells with separators, quotes and line breaks inside', () => {
    const table = parseCsv(
      'Fecha,Descripción,Monto\r\n03/10/2026,"Tacos, ""El Güero""\nGDL","-1,250.50"\r\n',
    )
    expect(table.rows).toEqual([['03/10/2026', 'Tacos, "El Güero"\nGDL', '-1,250.50']])
    const settings = guessColumns(table.header, table.rows)
    expect(settings.columns).toEqual(['date', 'payee', 'amount'])
  })

  it('IMP-03: files with the same columns share a profile, whatever the case or accents', () => {
    expect(headerKey(['Fecha', 'Categoría'])).toBe(headerKey(['FECHA', 'categoria']))
  })

  it('IMP-08: reads dates in the order the file writes them', () => {
    expect(guessDateOrder(['03/04/2026', '25/04/2026'])).toBe('dmy')
    expect(guessDateOrder(['04/25/2026'])).toBe('mdy')
    expect(readDate('03/04/2026', 'dmy')).toBe('2026-04-03')
    expect(readDate('03/04/26', 'mdy')).toBe('2026-03-04')
    expect(readDate('2026-07-18 10:30', 'dmy')).toBe('2026-07-18')
    expect(readDate('31/02/2026', 'dmy')).toBeNull()
  })

  it('IMP-08: reads amounts as exact minor units, never through a float', () => {
    expect(readAmount('-610.5', '.', 'MXN')).toBe(-61050)
    expect(readAmount('$1,234.56', '.', 'MXN')).toBe(123456)
    expect(readAmount('1.234,56', ',', 'MXN')).toBe(123456)
    expect(readAmount('(85.00)', '.', 'MXN')).toBe(-8500)
    expect(readAmount('85.00-', '.', 'MXN')).toBe(-8500)
    expect(readAmount('0.1', '.', 'MXN')).toBe(10)
    expect(readAmount('1.005', '.', 'MXN')).toBeNull()
    expect(readAmount('1500', '.', 'JPY')).toBe(1500)
    expect(readAmount('abc', '.', 'MXN')).toBeNull()
  })

  it('IMP-10: a row it cannot read is flagged with why, not guessed', () => {
    const { planned } = prepare(buddy)
    const zero = planned.find((item) => item.row.line === 5)
    expect(zero?.status).toEqual({ kind: 'unreadable', problem: 'zero' })
  })
})

describe('matching', () => {
  it('IMP-01: a file without a wallet column goes into the wallet chosen for it', () => {
    const { wallets } = prepare(buddy)
    expect(wallets).toEqual([{ name: '', rows: 5, target: { kind: 'existing', id: walletId } }])
  })

  it('IMP-23: categories match the person’s by name; the rest are made in the file’s group', () => {
    const { categories } = prepare(buddy)
    const byName = new Map(categories.map((link) => [link.name, link]))
    expect(byName.get('Groceries')?.target).toEqual({ kind: 'existing', id: groceries.id })
    expect(byName.get('Sweet Treat and Snacks')?.target).toEqual({
      kind: 'new',
      name: 'Sweet Treat and Snacks',
      group: { kind: 'existing', id: groups[0]!.id },
    })
    expect(byName.get('Salary')).toMatchObject({
      type: 'income',
      target: { kind: 'new', group: { kind: 'new', name: 'Income' } },
    })
  })

  it('IMP-20: a row that matches an imported transaction within 3 days is a probable duplicate', () => {
    const before: Transaction = {
      id: newId(),
      kind: 'expense',
      walletId,
      date: '2026-07-16',
      amount: -61050,
      source: 'import',
    }
    const { planned } = prepare(buddy, ledger([before]))
    expect(planned[0]?.status).toEqual({ kind: 'duplicate', matchId: before.id })
  })

  it('IMP-21: a row that matches one the person logged is merged, keeping their details', () => {
    const mine: Transaction = {
      id: newId(),
      kind: 'expense',
      walletId,
      date: '2026-07-13',
      amount: -80000,
      note: 'Road trip',
      source: 'quickAdd',
    }
    const result = build(buddy, ledger([mine]))
    expect(result.batch.merged).toEqual([{ id: mine.id, date: '2026-07-13' }])
    const change = result.changes.find((c) => c.id === mine.id)
    expect(change?.body).toMatchObject({
      deleted: false,
      data: { date: '2026-07-11', note: 'Road trip', amount: -80000 },
    })
  })

  it('IMP-22: money out of one wallet and into another within 3 days is one transfer', () => {
    const csv = [
      'Date,Account,Category,Amount',
      '2026-10-01,BBVA Debit,Transfer,-5000.00',
      '2026-10-02,Nu Savings,Transfer,5000.00',
      '2026-10-02,Nu Savings,Salary,800.00',
    ].join('\n')
    const { planned } = prepare(csv)
    expect(planned[0]?.status).toMatchObject({ kind: 'transfer', pairLine: 3, likely: true })
    const result = build(csv)
    const transfer = result.changes.find(
      (c) => !c.body.deleted && (c.body.data as { kind?: string }).kind === 'transfer',
    )
    expect(transfer?.body).toMatchObject({
      data: { walletId, amount: -500000, toAmount: 500000 },
    })
  })
})

describe('importing', () => {
  it('IMP-30, IMP-32: confident rows go in with no question, with their totals', () => {
    const { planned } = prepare(buddy)
    expect(summarize(planned)).toMatchObject({
      ready: 4,
      flagged: 1,
      spent: 61050 + 19400 + 80000,
      earned: 2500000,
      from: '2026-07-11',
      to: '2026-07-18',
    })
  })

  it('IMP-34: saves one batch with the file, the counts and every record it made', () => {
    const result = build(buddy)
    expect(result.changes[0]?.id).toBe(result.batchId)
    expect(result.batch).toMatchObject({
      fileName: 'export.csv',
      rows: 5,
      imported: 4,
      skipped: 1,
      waiting: [{ line: 5, problem: 'zero' }],
    })
    const transactions = result.changes.filter(
      (c) => !c.body.deleted && c.body.type === 'transaction',
    )
    expect(transactions).toHaveLength(4)
    for (const t of transactions)
      expect(t.body).toMatchObject({ data: { importBatchId: result.batchId, source: 'import' } })
    // Two new categories, one new group (Income), and payees for the named rows.
    expect(result.batch.created).toHaveLength(
      result.changes.filter((c) => ['category', 'categoryGroup', 'payee'].includes(c.body.type))
        .length,
    )
  })

  it('WAL-05: a new wallet’s balance today sets its opening balance at its first date', () => {
    const csv = [
      'Date,Account,Amount',
      '2026-10-01,Nu Card,-300.00',
      '2026-10-05,Nu Card,-200.00',
    ].join('\n')
    const current = ledger()
    const { planned, wallets, categories } = prepare(csv, current)
    const link = wallets[0]!
    expect(link.target).toMatchObject({ kind: 'new', preset: 'creditCard' })
    if (link.target.kind === 'new') link.target.balanceToday = -120000
    const result = buildImport({
      planned,
      wallets,
      categories,
      decisions: defaultDecisions(planned),
      ledger: current,
      uncategorizedId: uncategorized.id,
      file: { name: 'card.csv', source: 'csv' },
      newWallet: (target, name) => ({
        name,
        preset: target.preset,
        currency: target.currency,
        icon: 'creditCard',
        color: 'berry',
        features: [],
        active: true,
        inNetWorth: true,
        inBudget: true,
      }),
      names: { wallet: 'Imported', group: 'Imported' },
      newId,
      now: new Date('2026-10-19T12:00:00Z'),
    })
    const opening = result.changes.find(
      (c) => !c.body.deleted && (c.body.data as { kind?: string }).kind === 'openingBalance',
    )
    expect(opening?.body).toMatchObject({ data: { amount: -70000, date: '2026-10-01' } })
  })

  it('IMP-35: undoing removes exactly what the import added and keeps what is used elsewhere', () => {
    const mine: Transaction = {
      id: newId(),
      kind: 'expense',
      walletId,
      date: '2026-07-13',
      amount: -80000,
      source: 'manual',
    }
    const result = build(buddy, ledger([mine]))
    const records = new Map(result.changes.map((c) => [c.id, c.body]))
    const imported: Transaction[] = result.changes.flatMap((c) =>
      !c.body.deleted && c.body.type === 'transaction'
        ? [{ id: c.id, ...(c.body.data as Omit<Transaction, 'id'>) }]
        : [],
    )
    const categories = result.changes.flatMap((c) =>
      !c.body.deleted && c.body.type === 'category'
        ? [{ id: c.id, ...(c.body.data as Omit<Category, 'id'>) }]
        : [],
    )
    // After the import, the person logs an expense in one of the new categories.
    const salaryId = categories.find((category) => category.name === 'Salary')!.id
    const later: Transaction = {
      id: newId(),
      kind: 'income',
      walletId,
      date: '2026-10-01',
      amount: 100,
      categoryId: salaryId,
    }
    const all = [...imported, later]
    const undo = undoImport(result.batchId, result.batch, {
      transactions: all,
      categories: [groceries, uncategorized, ...categories],
      recurring: [],
      typeOf: (id) => records.get(id)?.type,
    })
    const deletedIds = undo.changes.filter((c) => c.body.deleted).map((c) => c.id)
    for (const t of imported.filter((t) => t.importBatchId === result.batchId))
      expect(deletedIds).toContain(t.id)
    expect(deletedIds).not.toContain(later.id)
    expect(deletedIds).not.toContain(salaryId)
    expect(undo.kept).toContain(salaryId)
    expect(deletedIds.at(-1)).toBe(result.batchId)
  })

  it('IMP-01: rows without a wallet go into a wallet with their currency', () => {
    const current = ledger()
    const dollars = { ...current, wallets: current.wallets.map((w) => ({ ...w, currency: 'USD' })) }
    const text = 'Date;Category;Amount;Currency\n2026-09-01;Súper;-120.00;MXN\n'
    const rows = readRows(
      parseCsv(text),
      guessColumns(['Date', 'Category', 'Amount', 'Currency'], []),
      'USD',
    )
    expect(linkWallets(rows, dollars, walletId, 'USD')[0]?.target).toMatchObject({
      kind: 'new',
      currency: 'MXN',
    })
    expect(linkWallets(rows, current, walletId, 'MXN')[0]?.target).toEqual({
      kind: 'existing',
      id: walletId,
    })
  })

  it('IMP-08: reads a long run of symbols quickly and a minus sign as negative', () => {
    const started = Date.now()
    expect(readAmount(`${'+'.repeat(50_000)}x`, '.', 'MXN')).toBeNull()
    expect(Date.now() - started).toBeLessThan(500)
    expect(readAmount('\u221212.50', '.', 'MXN')).toBe(-1250)
    expect(readAmount('$ 1,234.00 MXN', '.', 'MXN')).toBe(123_400)
  })
})
