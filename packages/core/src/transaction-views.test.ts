import { describe, expect, it } from 'vitest'
import { periodOf, shiftPeriod } from './dates.ts'
import {
  activeFilters,
  flowType,
  matchesFilter,
  sortTransactions,
  type TransactionLookups,
} from './transaction-views.ts'
import { flowTotals, type Transaction } from './transactions.ts'

function entry(id: string, fields: Partial<Transaction> = {}): Transaction {
  return { id, kind: 'expense', walletId: 'cash', date: '2026-10-01', amount: -100, ...fields }
}

const list: Transaction[] = [
  entry('a', { amount: -4550, categoryId: 'groceries', note: 'Súper semanal' }),
  entry('b', { kind: 'income', amount: 120_000, categoryId: 'salary', date: '2026-10-02' }),
  entry('c', {
    kind: 'transfer',
    amount: -20_000,
    toWalletId: 'card',
    toAmount: 20_000,
    date: '2026-10-03',
  }),
  entry('d', {
    amount: -900,
    categoryId: 'coffee',
    payeeId: 'cafe',
    tagIds: ['work'],
    excludeFromBudget: true,
    source: 'quickAdd',
  }),
]

const groupOf: Record<string, string> = { groceries: 'food', coffee: 'food', salary: 'income' }
const lookups: TransactionLookups = {
  categoryId: (transaction) => transaction.categoryId ?? null,
  groupId: (transaction) =>
    transaction.categoryId === undefined ? null : (groupOf[transaction.categoryId] ?? null),
  payeeName: (transaction) => (transaction.payeeId === 'cafe' ? 'Café Avellaneda' : null),
}

const ids = (items: readonly Transaction[]) => items.map((item) => item.id)
const matching = (filter: Parameters<typeof matchesFilter>[1]) =>
  ids(list.filter((item) => matchesFilter(item, filter, lookups)))

describe('periods', () => {
  it('TXN-22: weeks, months, quarters and years hold the date and move by one', () => {
    // 2026-10-16 is a Friday; weeks start on Sunday unless the person chose Monday.
    expect(periodOf('2026-10-16', 'week')).toEqual({ start: '2026-10-11', end: '2026-10-17' })
    expect(periodOf('2026-10-16', 'week', 1)).toEqual({ start: '2026-10-12', end: '2026-10-18' })
    expect(periodOf('2026-02-10', 'month')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(periodOf('2026-11-30', 'quarter')).toEqual({ start: '2026-10-01', end: '2026-12-31' })
    expect(periodOf('2026-05-05', 'year')).toEqual({ start: '2026-01-01', end: '2026-12-31' })
    expect(shiftPeriod('2026-01-31', 'month', -1)).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
    })
    expect(shiftPeriod('2026-10-16', 'quarter', 1).start).toBe('2027-01-01')
    expect(shiftPeriod('2026-10-16', 'week', -1).start).toBe('2026-10-04')
  })
})

describe('transaction views', () => {
  it('TXN-24: totals count income and expenses, never transfers', () => {
    const currencies = new Map([
      ['cash', 'MXN'],
      ['card', 'MXN'],
    ])
    expect(flowTotals(list, currencies, 'MXN', [])).toEqual({
      income: 120_000,
      expenses: 5450,
      net: 114_550,
    })
  })

  it('TXN-22: each filter narrows the list, and an empty one means any', () => {
    expect(matching({})).toEqual(['a', 'b', 'c', 'd'])
    expect(matching({ types: [] })).toEqual(['a', 'b', 'c', 'd'])
    expect(matching({ types: ['transfer'] })).toEqual(['c'])
    // A transfer belongs to both of its wallets.
    expect(matching({ walletIds: ['card'] })).toEqual(['c'])
    expect(matching({ groupIds: ['food'] })).toEqual(['a', 'd'])
    expect(matching({ categoryIds: ['salary'] })).toEqual(['b'])
    expect(matching({ tagIds: ['work'] })).toEqual(['d'])
    expect(matching({ payeeIds: ['cafe'] })).toEqual(['d'])
    expect(matching({ minAmount: 1000, maxAmount: 50_000 })).toEqual(['a', 'c'])
    expect(matching({ sources: ['quickAdd'] })).toEqual(['d'])
    expect(matching({ budget: 'excluded' })).toEqual(['d'])
    expect(matching({ types: ['expense'], budget: 'included' })).toEqual(['a'])
  })

  it('TXN-22: text search looks in notes and payees, ignoring case and accents', () => {
    expect(matching({ text: 'super' })).toEqual(['a'])
    expect(matching({ text: 'CAFE' })).toEqual(['d'])
    expect(activeFilters({ text: '  ' })).toBe(0)
    expect(activeFilters({ text: 'a', types: ['income'], minAmount: 1, maxAmount: 2 })).toBe(3)
  })

  it('TXN-21: sorts by date, size or name, ties newest first', () => {
    const sortLookups = {
      size: (transaction: Transaction) => Math.abs(transaction.amount),
      categoryName: (transaction: Transaction) => transaction.categoryId ?? '',
      groupName: () => '',
      walletName: (transaction: Transaction) => transaction.walletId,
    }
    expect(ids(sortTransactions(list, 'newest', sortLookups))).toEqual(['c', 'b', 'd', 'a'])
    expect(ids(sortTransactions(list, 'oldest', sortLookups))).toEqual(['a', 'd', 'b', 'c'])
    expect(ids(sortTransactions(list, 'largest', sortLookups))).toEqual(['b', 'c', 'a', 'd'])
    expect(ids(sortTransactions(list, 'category', sortLookups))).toEqual(['c', 'd', 'a', 'b'])
    expect(flowType({ kind: 'interest', amount: -5 })).toBe('expense')
    expect(flowType({ kind: 'openingBalance', amount: 5 })).toBe('balance')
  })
})
