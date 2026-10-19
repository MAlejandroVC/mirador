import { describe, expect, it } from 'vitest'
import {
  type AnalysisContext,
  analysisEntries,
  type AnalysisView,
  breakdown,
  compareSpending,
  filterEntries,
  flexibilitySplit,
  median,
  pace,
  periodTotals,
  spendingSeries,
  splitChange,
  usualSpending,
  whatChanged,
} from './analysis.ts'
import type { Category } from './categories.ts'
import { monthOf } from './dates.ts'
import type { Transaction } from './transactions.ts'

const categories: Category[] = [
  {
    id: 'food',
    name: 'Groceries',
    groupId: 'home',
    kind: 'expense',
    icon: 'basket',
    flexibility: 'fixed',
  },
  {
    id: 'cafe',
    name: 'Coffee',
    groupId: 'fun',
    kind: 'expense',
    icon: 'coffee',
    flexibility: 'flexible',
  },
  {
    id: 'rent',
    name: 'Rent',
    groupId: 'home',
    kind: 'expense',
    icon: 'house',
    flexibility: 'locked',
  },
  {
    id: 'salary',
    name: 'Salary',
    groupId: 'income',
    kind: 'income',
    icon: 'money',
    flexibility: 'fixed',
  },
  {
    id: 'refunds',
    name: 'Refunds',
    groupId: 'other',
    kind: 'income',
    icon: 'arrow',
    flexibility: 'flexible',
    systemKey: 'refunds',
  },
  {
    id: 'none',
    name: 'Uncategorized',
    groupId: 'other',
    kind: 'any',
    icon: 'question',
    flexibility: 'flexible',
    systemKey: 'uncategorized',
  },
]

const context: AnalysisContext = {
  walletCurrency: new Map([
    ['cash', 'MXN'],
    ['usd', 'USD'],
  ]),
  currency: 'MXN',
  rates: [{ id: 'r', from: 'USD', to: 'MXN', rate: 18_000_000, date: '2026-01-01' }],
  categories,
}

let next = 0
function tx(fields: Partial<Transaction>): Transaction {
  next += 1
  return {
    id: `t${String(next).padStart(4, '0')}`,
    kind: 'expense',
    walletId: 'cash',
    date: '2026-10-05',
    amount: -1000,
    ...fields,
  }
}

const view = (date: string, today: string, firstDate = '2026-01-01'): AnalysisView => ({
  period: monthOf(date),
  scope: 'month',
  firstDay: 0,
  today,
  firstDate,
})

describe('entries', () => {
  it('TXN-11: a refund in an expense category lowers that category and is never income', () => {
    const entries = analysisEntries(
      [
        tx({ categoryId: 'cafe', amount: -5000 }),
        tx({ kind: 'income', categoryId: 'cafe', amount: 2000 }),
        tx({ kind: 'income', categoryId: 'salary', amount: 30_000 }),
        tx({ kind: 'income', categoryId: 'refunds', amount: 500 }),
      ],
      context,
    )
    const totals = periodTotals(entries, monthOf('2026-10-05'))
    expect(totals.income).toBe(30_000)
    expect(totals.spent).toBe(5000 - 2000 - 500)
    expect(breakdown(entries, monthOf('2026-10-05'), 'category')[0]).toMatchObject({
      key: 'cafe',
      spent: 3000,
      count: 1,
    })
  })

  it('TXN-03, TXN-32: transfers and balance changes never count; installments one part a month', () => {
    const entries = analysisEntries(
      [
        tx({ kind: 'transfer', amount: -9000, toWalletId: 'usd', toAmount: 500 }),
        tx({ kind: 'adjustment', amount: -100 }),
        tx({ kind: 'openingBalance', amount: 100_000 }),
        tx({ categoryId: 'food', amount: -3000, installments: { months: 3 } }),
      ],
      context,
    )
    expect(entries.map((entry) => [entry.date, entry.spent])).toEqual([
      ['2026-10-05', 1000],
      ['2026-11-05', 1000],
      ['2026-12-05', 1000],
    ])
    expect(entries[0]?.installment).toBe(true)
  })

  it('SYS-04: other currencies count at the rate on their date', () => {
    const [entry] = analysisEntries([tx({ walletId: 'usd', amount: -1000 })], context)
    expect(entry?.spent).toBe(18_000)
  })

  it('ANA-03: filters by wallet, group, category, tag and payee, and leave out excluded unless asked', () => {
    const entries = analysisEntries(
      [
        tx({ categoryId: 'food', tagIds: ['trip'] }),
        tx({ categoryId: 'cafe', payeeId: 'starbucks' }),
        tx({ categoryId: 'rent', excludeFromBudget: true }),
        tx({ walletId: 'usd', categoryId: 'food' }),
      ],
      context,
    )
    expect(filterEntries(entries, {})).toHaveLength(3)
    expect(filterEntries(entries, { includeExcluded: true })).toHaveLength(4)
    expect(filterEntries(entries, { groupIds: ['home'] })).toHaveLength(2)
    expect(filterEntries(entries, { tagIds: ['trip'] })).toHaveLength(1)
    expect(filterEntries(entries, { payeeIds: ['starbucks'] })).toHaveLength(1)
    expect(filterEntries(entries, { walletIds: ['usd'] })).toHaveLength(1)
    expect(filterEntries(entries, { categoryIds: ['rent'], includeExcluded: true })).toHaveLength(1)
  })
})

describe('periods', () => {
  it('ANA-01: income, spending, left over and savings rate', () => {
    const entries = analysisEntries(
      [
        tx({ kind: 'income', categoryId: 'salary', amount: 40_000 }),
        tx({ categoryId: 'rent', amount: -30_000 }),
      ],
      context,
    )
    expect(periodTotals(entries, monthOf('2026-10-01'))).toEqual({
      income: 40_000,
      spent: 30_000,
      leftOver: 10_000,
      savingsRate: 0.25,
    })
    expect(periodTotals([], monthOf('2026-10-01')).savingsRate).toBeNull()
  })

  it('BUD-01: usual is the median of the last 6 complete periods, leaving out those before the first record', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(3)
    expect(median([])).toBeNull()
    const entries = analysisEntries(
      ['2026-07-03', '2026-08-03', '2026-09-03'].map((date, index) =>
        tx({ date, amount: -(index + 1) * 1000 }),
      ),
      context,
    )
    const result = usualSpending(entries, view('2026-10-31', '2026-11-02', '2026-07-03'))
    expect(result.periods).toHaveLength(3)
    expect(result.usual).toBe(2000)
  })

  it('ANA-12: an in-progress period compares with the same days of earlier periods', () => {
    const entries = analysisEntries(
      [
        tx({ date: '2026-09-02', amount: -1000 }),
        tx({ date: '2026-09-25', amount: -9000 }),
        tx({ date: '2026-10-03', amount: -1500 }),
      ],
      context,
    )
    const result = usualSpending(entries, view('2026-10-10', '2026-10-10', '2026-09-01'))
    expect(result.current).toBe(1500)
    expect(result.usual).toBe(1000)
    const compared = compareSpending(entries, view('2026-10-10', '2026-10-10', '2026-09-01'))
    expect(compared).toMatchObject({ current: 1500, previous: 1000, average3: 1000 })
  })

  it('ANA-21: the pace curve adds up day by day and stops at today', () => {
    const entries = analysisEntries(
      [
        tx({ date: '2026-09-01', amount: -100 }),
        tx({ date: '2026-09-03', amount: -200 }),
        tx({ date: '2026-10-02', amount: -50 }),
      ],
      context,
    )
    const result = pace(entries, view('2026-10-01', '2026-10-03', '2026-09-01'))
    expect(result.days).toBe(31)
    expect(result.current).toEqual([0, 50, 50])
    expect(result.usual.slice(0, 4)).toEqual([100, 100, 300, 300])
    expect(result.usual.at(-1)).toBe(300)
  })

  it('ANA-11: a series per period over the last 12, oldest first', () => {
    const entries = analysisEntries(
      [tx({ date: '2026-09-10', categoryId: 'cafe' }), tx({ date: '2026-10-10' })],
      context,
    )
    const series = spendingSeries(
      entries,
      view('2026-10-10', '2026-10-20', '2026-09-10'),
      (entry) => entry.categoryId === 'cafe',
    )
    expect(series.map((point) => [point.period.start, point.spent, point.count])).toEqual([
      ['2026-09-01', 1000, 1],
      ['2026-10-01', 0, 0],
    ])
  })
})

describe('where it goes', () => {
  it('ANA-10, ANA-23: breakdown by group, category and tag with shares, counts and average tickets', () => {
    const entries = analysisEntries(
      [
        tx({ categoryId: 'food', amount: -6000, tagIds: ['trip'] }),
        tx({ categoryId: 'cafe', amount: -1000, tagIds: ['trip', 'work'] }),
        tx({ categoryId: 'cafe', amount: -3000 }),
      ],
      context,
    )
    const period = monthOf('2026-10-05')
    expect(breakdown(entries, period, 'group')).toEqual([
      { key: 'home', spent: 6000, share: 0.6, count: 1, average: 6000 },
      { key: 'fun', spent: 4000, share: 0.4, count: 2, average: 2000 },
    ])
    const tags = breakdown(entries, period, 'tag')
    expect(tags.map((slice) => [slice.key, slice.spent])).toEqual([
      ['trip', 7000],
      ['work', 1000],
    ])
  })

  it('ANA-13: Locked, Fixed and Flexible', () => {
    const entries = analysisEntries(
      [
        tx({ categoryId: 'rent', amount: -10_000 }),
        tx({ categoryId: 'food', amount: -3000 }),
        tx({ categoryId: 'cafe', amount: -500 }),
      ],
      context,
    )
    expect(flexibilitySplit(entries, monthOf('2026-10-01'))).toEqual({
      locked: 10_000,
      fixed: 3000,
      flexible: 500,
    })
  })

  it('ANA-26: a change splits into more purchases and a higher average ticket', () => {
    // 4 coffees at 50 became 6 at 60: 100 from buying more often, 60 from paying more.
    expect(splitChange({ spent: 200, count: 4 }, { spent: 360, count: 6 })).toEqual({
      difference: 160,
      frequency: 100,
      price: 60,
    })
  })

  it('ANA-30: what changed flags a category above usual by more than 25%', () => {
    const months = ['2026-07', '2026-08', '2026-09']
    const entries = analysisEntries(
      [
        ...months.flatMap((month) => [
          tx({ date: `${month}-03`, categoryId: 'cafe', amount: -1000 }),
          tx({ date: `${month}-04`, categoryId: 'food', amount: -5000 }),
        ]),
        tx({ date: '2026-10-03', categoryId: 'cafe', amount: -1000 }),
        tx({ date: '2026-10-04', categoryId: 'cafe', amount: -1000 }),
        tx({ date: '2026-10-04', categoryId: 'food', amount: -5200 }),
      ],
      context,
    )
    const changes = whatChanged(entries, view('2026-10-31', '2026-11-01', '2026-07-03'))
    expect(changes[0]).toMatchObject({
      categoryId: 'cafe',
      current: 2000,
      usual: 1000,
      difference: 1000,
      frequency: 1000,
      price: 0,
      flagged: true,
    })
    expect(changes[1]).toMatchObject({ categoryId: 'food', flagged: false })
  })
})
