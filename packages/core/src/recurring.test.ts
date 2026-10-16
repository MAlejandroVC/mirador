import { describe, expect, it } from 'vitest'
import {
  dueDates,
  nextOccurrence,
  occurrenceFields,
  occurrences,
  type Recurring,
  repeatPreset,
  upcoming,
  withoutRepeatedOccurrences,
} from './recurring.ts'
import type { Transaction } from './transactions.ts'

function recurring(fields: Partial<Recurring> = {}): Recurring {
  return {
    id: 'rent',
    kind: 'expense',
    walletId: 'checking',
    amount: -1_200_000,
    start: '2026-01-31',
    every: { unit: 'month', count: 1 },
    ...fields,
  }
}

describe('recurring transactions', () => {
  it('TXN-09: a monthly one keeps its day, or the last day of a shorter month', () => {
    expect(occurrences(recurring(), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('TXN-09: daily, weekly, every two weeks, yearly and custom schedules', () => {
    const from = (unit: 'day' | 'week' | 'year', count: number) =>
      occurrences(
        recurring({ start: '2026-10-01', every: { unit, count } }),
        '2026-10-01',
        '2028-10-01',
      ).slice(0, 3)
    expect(from('day', 1)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
    expect(from('week', 2)).toEqual(['2026-10-01', '2026-10-15', '2026-10-29'])
    expect(from('year', 1)).toEqual(['2026-10-01', '2027-10-01', '2028-10-01'])
    expect(from('day', 10)).toEqual(['2026-10-01', '2026-10-11', '2026-10-21'])
    expect(repeatPreset({ unit: 'week', count: 2 })).toBe('biweekly')
    expect(repeatPreset({ unit: 'day', count: 10 })).toBeNull()
  })

  it('TXN-09: ends on a date or after a number of times', () => {
    expect(occurrences(recurring({ times: 2 }), '2026-01-01', '2026-12-31')).toHaveLength(2)
    expect(occurrences(recurring({ until: '2026-03-30' }), '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
    ])
    expect(nextOccurrence(recurring({ times: 2 }), '2026-02-28')).toBeNull()
    expect(nextOccurrence(recurring(), '2026-02-28')).toBe('2026-03-31')
  })

  it('TXN-10: what came due since the last one added or skipped', () => {
    expect(dueDates(recurring(), '2026-03-01')).toEqual(['2026-01-31', '2026-02-28'])
    expect(dueDates(recurring({ handled: '2026-01-31' }), '2026-03-01')).toEqual(['2026-02-28'])
    expect(dueDates(recurring({ handled: '2026-02-28' }), '2026-03-01')).toEqual([])
  })

  it('TXN-10: each date adds a transaction marked as recurring, with its tags (CAT-24)', () => {
    const fields = occurrenceFields(
      recurring({ categoryId: 'housing', tagIds: ['home'], payeeId: 'landlord' }),
      '2026-02-28',
      '2026-02-28T09:00:00.000Z',
    )
    expect(fields).toMatchObject({
      kind: 'expense',
      walletId: 'checking',
      date: '2026-02-28',
      amount: -1_200_000,
      categoryId: 'housing',
      tagIds: ['home'],
      payeeId: 'landlord',
      source: 'recurring',
      recurringId: 'rent',
      occurrence: '2026-02-28',
    })
  })

  it('TXN-10: a date added on two devices at once counts once', () => {
    const added = (id: string): Transaction => ({
      id,
      kind: 'expense',
      walletId: 'checking',
      date: '2026-02-28',
      amount: -1_200_000,
      recurringId: 'rent',
      occurrence: '2026-02-28',
    })
    const other: Transaction = { ...added('c'), recurringId: undefined, occurrence: undefined }
    expect(withoutRepeatedOccurrences([added('b'), added('a'), other]).map((t) => t.id)).toEqual([
      'a',
      'c',
    ])
  })

  it('TXN-10: upcoming shows what is to come and the first one waiting to be checked', () => {
    const asks = recurring({ id: 'power', ask: true, start: '2026-09-10', handled: '2026-09-10' })
    const rent = recurring({ start: '2026-01-31', handled: '2026-09-30' })
    expect(
      upcoming([asks, rent], '2026-10-16', '2026-10-31').map((item) => [
        item.recurring.id,
        item.date,
        item.due,
      ]),
    ).toEqual([
      ['power', '2026-10-10', true],
      ['rent', '2026-10-31', false],
    ])
  })
})
