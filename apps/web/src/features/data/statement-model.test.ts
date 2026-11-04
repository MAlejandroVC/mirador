import type { PlannedRow, StatementTable } from '@repo/import'
import { describe, expect, it } from 'vitest'
import { samePayeeLines, statementChecks } from './statement-model'

// Made-up rows: three charges and a payment, as a card statement lists them.
const row = (line: number, payee: string, amount: number): PlannedRow => ({
  row: {
    line,
    date: '2026-08-02',
    amount,
    currency: 'MXN',
    transfer: false,
    payee,
    note: '',
    wallet: '',
    category: '',
    group: '',
    tags: [],
    problem: null,
    text: payee,
  },
  walletKey: '',
  status: { kind: 'noCategory' },
  categoryKey: null,
  suggestedCategoryId: null,
})
const planned = [
  row(2, 'OXXO GDL 1234', -9_600),
  row(3, 'CAFE AZUL', -4_500),
  row(4, 'SU PAGO GRACIAS', 500_000),
  row(5, 'OXXO ZAPOPAN 88', -4_550),
]
const box = { x: 0, y: 0, width: 0.5, height: 0.01 }
const fact = (minor: number) => ({ value: '', minor, page: 0, box })
const table = (charges: number): StatementTable => ({
  delimiter: '',
  header: ['Fecha', 'Descripción', 'Importe'],
  rows: [],
  sources: [],
  opening: null,
  closing: null,
  facts: {
    closing: null,
    due: null,
    limit: null,
    minimum: null,
    balance: fact(0),
    opening: fact(481_350),
    charges: fact(charges),
    credits: fact(500_000),
  },
})
const settings = {
  columns: ['date', 'payee', 'amount'] as const,
  dateOrder: 'dmy' as const,
  decimalMark: '.' as const,
  amountSign: 'positiveIsExpense' as const,
}
const file = (charges: number) => ({ name: 'card.pdf', fingerprint: 'f', table: table(charges) })

describe('checking against the statement', () => {
  it('IMP-37: the charges, the payments and the balance each add up', () => {
    const checks = statementChecks(
      file(18_650),
      { ...settings, columns: [...settings.columns] },
      planned,
      'MXN',
    )
    expect(checks.map((check) => [check.kind, check.off])).toEqual([
      ['charges', 0],
      ['credits', 0],
      ['balance', 0],
    ])
  })

  it('IMP-37: a missed charge shows how much is missing, and a row left out does not count', () => {
    const checks = statementChecks(
      file(18_650),
      { ...settings, columns: [...settings.columns] },
      planned,
      'MXN',
      new Set([3]),
    )
    expect(checks.find((check) => check.kind === 'charges')?.off).toBe(4_500)
  })
})

describe('categories for the same payee', () => {
  it('IMP-23: a category picked for one row fits the same payee written another way', () => {
    expect(samePayeeLines(planned, 2, new Map())).toEqual([5])
    expect(samePayeeLines(planned, 2, new Map([[5, 'x']]))).toEqual([])
  })
})
