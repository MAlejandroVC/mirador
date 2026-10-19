import type { RecordBody } from '@repo/api'
import {
  guessColumns,
  linkCategories,
  linkWallets,
  parseCsv,
  planRows,
  readRows,
  sampleRows,
  summarize,
} from '@repo/import'
import { describe, expect, it } from 'vitest'
import { archiveFile, archiveFileName, readArchive } from './format.ts'
import { restoreChanges } from './restore.ts'
import { spreadsheetFileName, transactionsSpreadsheet } from './spreadsheet.ts'

const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`
const body = (type: string, data: unknown): RecordBody => ({
  deleted: false,
  type,
  schema: 1,
  data,
})

const wallet = {
  name: 'Checking',
  preset: 'checking',
  currency: 'MXN',
  icon: 'bank',
  color: 'lake',
  features: [],
  active: true,
  inNetWorth: true,
  inBudget: true,
}
const group = { name: 'Food & drinks', color: 'lake' }
const category = {
  name: 'Groceries',
  groupId: id(2),
  kind: 'expense',
  icon: 'basket',
  flexibility: 'fixed',
}
const expense = {
  kind: 'expense',
  walletId: id(1),
  date: '2026-10-01',
  amount: -125050,
  categoryId: id(3),
  note: 'Súper, "big" shop',
}
const records = [
  { id: id(1), body: body('wallet', wallet) },
  { id: id(2), body: body('categoryGroup', group) },
  { id: id(3), body: body('category', category) },
  { id: id(4), body: body('transaction', expense) },
  { id: id(5), body: { deleted: true as const, type: 'transaction' } },
]

describe('backup', () => {
  it('DAT-01, DAT-04: a backup read back holds exactly the records that were saved', () => {
    const text = archiveFile(records, 'ana', new Date('2026-10-19T12:00:00Z'))
    const read = readArchive(text)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.archive.records).toHaveLength(4)
    // Replacing an account with its own backup changes nothing it had.
    const { changes } = restoreChanges(read.archive, records, 'replace')
    const saved = new Map(changes.map((change) => [change.id, change.body]))
    for (const record of records.filter((r) => !r.body.deleted))
      expect(saved.get(record.id)).toEqual(record.body)
  })

  it('DAT-04: replacing removes what the account had that the backup does not', () => {
    const read = readArchive(archiveFile(records.slice(0, 2), 'ana', new Date()))
    if (!read.ok) throw new Error('unreadable')
    const { changes } = restoreChanges(read.archive, records, 'replace')
    expect(changes).toContainEqual({ id: id(4), body: { deleted: true, type: 'transaction' } })
  })

  it('DAT-05: adding into an account with data skips what is there and reuses same names', () => {
    const read = readArchive(archiveFile(records, 'ana', new Date()))
    if (!read.ok) throw new Error('unreadable')
    // Another account with its own Groceries (as every account starts with) and the
    // backup's wallet already restored.
    const here = [
      { id: id(1), body: body('wallet', wallet) },
      { id: id(20), body: body('categoryGroup', group) },
      { id: id(21), body: body('category', { ...category, groupId: id(20) }) },
    ]
    const result = restoreChanges(read.archive, here, 'merge')
    expect(result.changes.map((change) => change.id)).toEqual([id(4)])
    expect(result.changes[0]?.body).toMatchObject({ data: { categoryId: id(21) } })
    expect(result.skipped).toBe(3)
  })

  it('DAT-07: a file with problems is refused whole, each problem with where it is', () => {
    const file = JSON.parse(archiveFile(records, 'ana', new Date())) as {
      records: { type: string; data: Record<string, unknown> }[]
    }
    const broken = file.records.find((r) => r.type === 'transaction')
    if (broken) broken.data.amount = 12.5
    const read = readArchive(JSON.stringify(file))
    expect(read.ok).toBe(false)
    if (!read.ok)
      expect(read.errors[0]?.location).toMatch(/^records\[\d+\] \(transaction\)\.amount$/)
    expect(readArchive('not json')).toMatchObject({ ok: false, errors: [{ message: 'notJson' }] })
    expect(readArchive('{"format":"other"}')).toMatchObject({ ok: false })
  })

  it('DAT-06: a file from a newer Mirador is refused rather than read wrong', () => {
    const file = JSON.parse(archiveFile(records, 'ana', new Date())) as { version: number }
    file.version = 99
    expect(readArchive(JSON.stringify(file))).toMatchObject({
      ok: false,
      errors: [{ message: 'newerVersion' }],
    })
  })
})

describe('spreadsheet', () => {
  it('DAT-02: one row per transaction with every name written out, readable by the import', () => {
    const csv = transactionsSpreadsheet({
      wallets: [{ id: id(1), ...wallet }],
      groups: [{ id: id(2), name: group.name, color: 'lake' }],
      categories: [{ id: id(3), ...category, kind: 'expense', flexibility: 'fixed' }],
      tags: [],
      payees: [],
      transactions: [{ id: id(4), ...expense, kind: 'expense' }],
    })
    expect(csv.startsWith('﻿Date,Type,Wallet,Amount,Currency,Category,Category group')).toBe(true)
    expect(csv).toContain(
      '2026-10-01,expense,Checking,-1250.50,MXN,Groceries,Food & drinks,,,"Súper, ""big"" shop"',
    )
    // IMP-02: Mirador's own spreadsheet comes back in with no column to fix.
    const table = parseCsv(csv)
    const settings = guessColumns(table.header, table.rows)
    const [row] = readRows(table, settings, 'MXN')
    expect(row).toMatchObject({
      date: '2026-10-01',
      amount: -125050,
      wallet: 'Checking',
      category: 'Groceries',
      group: 'Food & drinks',
      note: 'Súper, "big" shop',
    })
  })
})

describe('sample data', () => {
  it('goes in like any file: about 14 months, every row confident, transfers paired', () => {
    const rows = sampleRows(
      '2026-10-19',
      {
        wallet: (key) => key,
        group: (key) => key,
        category: (key) => key,
        tag: (key) => key,
      },
      'MXN',
    )
    const ledger = { wallets: [], groups: [], categories: [], payees: [], transactions: [] }
    const wallets = linkWallets(rows, ledger, null, 'MXN')
    expect(wallets.map((w) => w.name).sort()).toEqual(['cash', 'checking', 'creditCard', 'savings'])
    expect(linkCategories(rows, ledger).length).toBeGreaterThan(15)
    const planned = planRows(rows, ledger, wallets, () => 'MXN')
    const summary = summarize(planned)
    expect(summary.from).toBe('2025-09-01')
    expect(summary.to! <= '2026-10-19').toBe(true)
    expect(planned.every((p) => p.status.kind === 'ready' || p.status.kind === 'transfer')).toBe(
      true,
    )
    expect(planned.filter((p) => p.status.kind === 'transfer').length).toBe(14 * 3 * 2)
  })

  it('DAT-01, DAT-02: file names say which is the backup and which the export', () => {
    expect(archiveFileName('ana', '2026-10-19')).toBe('mirador-backup-ana-2026-10-19.json')
    expect(spreadsheetFileName('2026-10-19')).toBe('mirador-transactions-export-2026-10-19.csv')
  })
})
