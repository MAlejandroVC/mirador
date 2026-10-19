import { describe, expect, it } from 'vitest'
import { type AnalysisEntry, type AnalysisView } from './analysis.ts'
import type { Category } from './categories.ts'
import { monthOf } from './dates.ts'
import {
  committed,
  cutSavings,
  improvements,
  incomeAndSpending,
  incomeSources,
  netWorthHistory,
  projection,
  seasons,
} from './outlook.ts'
import type { Recurring } from './recurring.ts'
import type { Transaction } from './transactions.ts'
import type { Wallet } from './wallets.ts'

let next = 0
function entry(fields: Partial<AnalysisEntry>): AnalysisEntry {
  next += 1
  const id = `e${String(next).padStart(4, '0')}`
  return {
    id,
    transactionId: id,
    date: '2026-10-05',
    spent: 1000,
    earned: 0,
    refund: false,
    categoryId: null,
    groupId: null,
    flexibility: null,
    tagIds: [],
    payeeId: null,
    walletId: 'cash',
    note: null,
    recurringId: null,
    installment: false,
    excluded: false,
    ...fields,
  }
}

const category = (id: string, flexibility: Category['flexibility']): Category => ({
  id,
  name: id,
  groupId: 'g',
  kind: 'expense',
  icon: 'x',
  flexibility,
})

const view = (today: string, firstDate: string): AnalysisView => ({
  period: monthOf(today),
  scope: 'month',
  firstDay: 0,
  today,
  firstDate,
})

const context = { walletCurrency: new Map([['card', 'MXN']]), currency: 'MXN', rates: [] }

describe('looking ahead', () => {
  it('ANA-27: installment parts and recurring expenses still to come, by month', () => {
    const transactions: Transaction[] = [
      {
        id: 'tv',
        kind: 'expense',
        walletId: 'card',
        date: '2026-09-10',
        amount: -12_000,
        installments: { months: 3 },
      },
    ]
    const recurrings: Recurring[] = [
      {
        id: 'gym',
        kind: 'expense',
        walletId: 'card',
        amount: -500,
        start: '2026-01-20',
        every: { unit: 'month', count: 1 },
        handled: '2026-09-20',
      },
      {
        id: 'pay',
        kind: 'income',
        walletId: 'card',
        amount: 50_000,
        start: '2026-01-01',
        every: { unit: 'month', count: 1 },
      },
    ]
    const months = committed(transactions, recurrings, context, '2026-10-15', 3)
    expect(
      months.map((month) => [month.period.start, month.installments, month.recurring]),
    ).toEqual([
      ['2026-10-01', 0, 500],
      ['2026-11-01', 4000, 500],
      ['2026-12-01', 0, 500],
    ])
    expect(months[1]?.items.map((item) => item.source)).toEqual(['installment', 'recurring'])
  })

  it('ANA-31: Flexible categories ranked by what a step could save, never below their proven level', () => {
    const months = ['04', '05', '06', '07', '08', '09']
    const entries = [
      ...months.map((month, index) =>
        entry({ date: `2026-${month}-10`, categoryId: 'eating', spent: 10_000 + index * 1000 }),
      ),
      ...months.map((month) =>
        entry({ date: `2026-${month}-10`, categoryId: 'clothes', spent: 4000 }),
      ),
      ...months.map((month) =>
        entry({ date: `2026-${month}-10`, categoryId: 'rent', spent: 90_000 }),
      ),
    ]
    const ranked = improvements(entries, view('2026-10-15', '2026-04-01'), [
      category('eating', 'flexible'),
      category('clothes', 'flexible'),
      category('rent', 'locked'),
    ])
    // Clothes never moved, so there is no proven lower level to step down to.
    expect(ranked.map((item) => item.categoryId)).toEqual(['eating'])
    expect(ranked[0]).toMatchObject({ usual: 12_500, proven: 10_000, potential: 1875 })
    expect(ranked[0]?.trend).toBeCloseTo(3 / 11)
  })

  it('ANA-32: what a 5, 10 or 20% cut saves per period and per year', () => {
    expect(cutSavings(10_000)).toEqual([
      { percent: 5, perPeriod: 500, perYear: 6000 },
      { percent: 10, perPeriod: 1000, perYear: 12_000 },
      { percent: 20, perPeriod: 2000, perYear: 24_000 },
    ])
  })

  it('ANA-36: costly months need 13 months of history and give an amount to set aside', () => {
    const entries = Array.from({ length: 14 }, (_, index) => {
      const month = new Date(Date.UTC(2025, 8 + index, 5)).toISOString().slice(0, 10)
      return entry({ date: month, spent: month.slice(5, 7) === '12' ? 22_000 : 10_000 })
    })
    expect(seasons(entries.slice(-12), '2026-11-20', '2025-11-05')).toBeNull()
    const result = seasons(entries, '2026-11-20', '2025-09-05')
    expect(result?.usual).toBe(10_000)
    expect(result?.months.map((month) => [month.month, month.extra])).toEqual([[12, 12_000]])
    expect(result?.setAside).toBe(1000)
  })

  it('ANA-40: a projection at a steady left over and when it reaches a target', () => {
    expect(projection(1000, 500, 4, 2600)).toEqual({
      points: [1000, 1500, 2000, 2500, 3000],
      reachedIn: 4,
    })
    expect(projection(1000, -10, 2, 2000).reachedIn).toBeNull()
  })

  it('ANA-16: net worth at the end of each month from transactions up to then', () => {
    const wallets: Wallet[] = [
      {
        id: 'card',
        name: 'Card',
        preset: 'checking',
        currency: 'MXN',
        features: [],
        active: true,
        inNetWorth: true,
        inBudget: true,
      },
    ]
    const transactions: Transaction[] = [
      { id: 'a', kind: 'openingBalance', walletId: 'card', date: '2026-08-01', amount: 10_000 },
      { id: 'b', kind: 'expense', walletId: 'card', date: '2026-09-15', amount: -3000 },
      { id: 'c', kind: 'expense', walletId: 'card', date: '2026-10-20', amount: -1000 },
    ]
    const history = netWorthHistory(wallets, transactions, context, '2026-10-10', 3)
    expect(history.map((point) => point.netWorth)).toEqual([10_000, 7000, 7000])
  })

  it('ANA-15, ANA-25: income sources with their steadiness, and income against spending', () => {
    const months = ['04', '05', '06', '07', '08', '09']
    const entries = months.flatMap((month, index) => [
      entry({ date: `2026-${month}-01`, categoryId: 'salary', spent: 0, earned: 50_000 }),
      ...(index % 2 === 0
        ? [entry({ date: `2026-${month}-02`, categoryId: 'freelance', spent: 0, earned: 10_000 })]
        : []),
      entry({ date: `2026-${month}-03`, spent: 30_000 }),
    ])
    const sources = incomeSources(entries, view('2026-10-15', '2026-04-01'))
    expect(sources.map((source) => [source.categoryId, source.average])).toEqual([
      ['salary', 50_000],
      ['freelance', 5000],
    ])
    expect(sources[0]?.variability).toBe(0)
    expect(sources[1]?.variability).toBe(1)
    const flows = incomeAndSpending(entries, view('2026-10-15', '2026-04-01'))
    expect(flows.points).toHaveLength(7)
    expect(flows.points[0]).toMatchObject({ income: 60_000, spent: 30_000 })
    expect(flows.spentChange).toBeNull()
  })
})
