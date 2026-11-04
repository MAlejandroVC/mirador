import { describe, expect, it } from 'vitest'
import type { AnalysisEntry } from './analysis.ts'
import {
  byWeekday,
  byWeekOfPeriod,
  cadence,
  paydaySpending,
  recurringCharges,
  sameDayPairs,
  smallPurchases,
  tagDays,
} from './habits.ts'
import { monthOf } from './dates.ts'

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

const october = monthOf('2026-10-01')

describe('when', () => {
  it('ANA-22: by weekday averages over how many times each day came up', () => {
    // October 2026 has five Saturdays (3, 10, 17, 24, 31) and four Mondays.
    const days = byWeekday(
      [entry({ date: '2026-10-03', spent: 5000 }), entry({ date: '2026-10-05', spent: 4000 })],
      october,
    )
    expect(days[6]).toBe(1000)
    expect(days[1]).toBe(1000)
    expect(days[0]).toBe(0)
  })

  it('ANA-22: by week of the period, the last week taking the rest', () => {
    const weeks = byWeekOfPeriod(
      [entry({ date: '2026-10-01' }), entry({ date: '2026-10-30', spent: 300 })],
      [october],
    )
    expect(weeks).toEqual([1000, 0, 0, 0, 300])
  })

  it('ANA-22: the days right after payday against the others', () => {
    const result = paydaySpending(
      [
        entry({ date: '2026-10-15', spent: 0, earned: 50_000 }),
        entry({ date: '2026-10-20', spent: 0, earned: 100 }),
        entry({ date: '2026-10-15', spent: 3000 }),
        entry({ date: '2026-10-16', spent: 3000 }),
        entry({ date: '2026-10-01', spent: 2800 }),
      ],
      october,
    )
    expect(result).toEqual({ paydays: 1, after: 2000, otherDays: 100 })
  })
})

// Days later in October with only groceries.
const filler = (count: number) =>
  Array.from({ length: count }, (_, day) =>
    entry({ date: `2026-10-${String(day + 15)}`, categoryId: 'groceries' }),
  )

describe('how', () => {
  it('ANA-28: a day with a tag against a day without it, in total and per category', () => {
    const result = tagDays(
      [
        entry({ date: '2026-10-02', categoryId: 'bar', spent: 6000, tagIds: ['friends'] }),
        entry({ date: '2026-10-02', categoryId: 'taxi', spent: 1000 }),
        entry({ date: '2026-10-09', categoryId: 'taxi', spent: 2900 }),
      ],
      october,
    )
    expect(result[0]).toMatchObject({ tagId: 'friends', days: 1, withTag: 7000, withoutTag: 97 })
    expect(result[0]?.categories[0]).toEqual({ categoryId: 'bar', withTag: 6000, withoutTag: 0 })
  })

  it('ANA-29: a category that comes on at least half the days of another, with at least 5 days', () => {
    const dates = ['01', '02', '03', '04', '05', '06', '07', '08'].map((day) => `2026-10-${day}`)
    const entries = dates.flatMap((date, index) => [
      entry({ date, categoryId: 'movies' }),
      ...(index < 5 ? [entry({ date, categoryId: 'snacks', spent: 300 + index })] : []),
    ])
    // Other days with spending, so snacks are rarer on a usual day than with movies.
    entries.push(...filler(12))
    const pairs = sameDayPairs(entries, october)
    expect(pairs).toContainEqual({
      first: 'movies',
      second: 'snacks',
      days: 8,
      together: 5,
      usual: 302,
    })
    expect(sameDayPairs(entries.slice(0, 4), october)).toEqual([])
  })

  it('ANA-29: something bought nearly every day is not a pair with everything', () => {
    const dates = Array.from(
      { length: 20 },
      (_, day) => `2026-10-${String(day + 1).padStart(2, '0')}`,
    )
    const entries = dates.flatMap((date, index) => [
      entry({ date, categoryId: 'coffee' }),
      ...(index < 6 ? [entry({ date, categoryId: 'movies' })] : []),
    ])
    expect(sameDayPairs(entries, october)).toEqual([])
  })

  it('ANA-29: each pair shows once, and Locked categories are never part of one', () => {
    const dates = ['01', '02', '03', '04', '05'].map((day) => `2026-10-${day}`)
    const entries = dates.flatMap((date) => [
      entry({ date, categoryId: 'drinks' }),
      entry({ date, categoryId: 'rides' }),
      entry({ date, categoryId: 'rent', flexibility: 'locked' }),
    ])
    entries.push(...filler(10))
    const pairs = sameDayPairs(entries, october)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({ first: 'drinks', second: 'rides' })
  })

  it('ANA-24: a gap is read in calendar terms', () => {
    expect(cadence(7)).toEqual({ unit: 'week', count: 1 })
    expect(cadence(14)).toEqual({ unit: 'week', count: 2 })
    expect(cadence(28)).toEqual({ unit: 'month', count: 1 })
    expect(cadence(31)).toEqual({ unit: 'month', count: 1 })
    expect(cadence(61)).toEqual({ unit: 'month', count: 2 })
    expect(cadence(365)).toEqual({ unit: 'year', count: 1 })
    expect(cadence(45)).toEqual({ unit: 'day', count: 45 })
  })

  it('ANA-24: regular charges of a similar amount are recurring, with their yearly cost', () => {
    const months = ['07', '08', '09', '10']
    const entries = [
      ...months.map((month, index) =>
        entry({ date: `2026-${month}-12`, payeeId: 'netflix', spent: 21_900 + index * 100 }),
      ),
      // Same payee, wildly different amounts: not a subscription.
      ...months.map((month, index) =>
        entry({ date: `2026-${month}-03`, payeeId: 'super', spent: 10_000 * (index + 1) }),
      ),
      ...['2026-10-01', '2026-10-08', '2026-10-15'].map((date) =>
        entry({ date, note: 'Gym 3', spent: 500 }),
      ),
    ]
    const charges = recurringCharges(entries, '2026-10-20')
    expect(charges.map((charge) => charge.payeeId ?? charge.note)).toEqual(['netflix', 'Gym 3'])
    expect(charges[0]).toMatchObject({
      interval: 31,
      every: { unit: 'month', count: 1 },
      times: 4,
      amount: 22_050,
    })
    // Monthly is 12 a year, not 365 / 31.
    expect(charges[0]?.yearly).toBe(22_050 * 12)
    // Stopped two gaps ago: no longer a cost.
    expect(recurringCharges(entries, '2027-02-01').map((charge) => charge.payeeId)).toEqual([])
  })

  it('ANA-37: small expenses added up against each category group', () => {
    const result = smallPurchases(
      [
        entry({ spent: 100, groupId: 'fun' }),
        entry({ spent: 200, groupId: 'fun' }),
        entry({ spent: 5000, groupId: 'home' }),
        entry({ spent: 9000, groupId: 'home' }),
      ],
      october,
    )
    expect(result).toEqual({
      below: 2600,
      count: 2,
      total: 300,
      groups: [
        { groupId: 'home', spent: 14_000 },
        { groupId: 'fun', spent: 300 },
      ],
    })
  })
})
