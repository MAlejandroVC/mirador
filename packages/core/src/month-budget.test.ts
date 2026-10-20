import { describe, expect, it } from 'vitest'
import {
  budgetMonths,
  budgeted,
  type MonthBudgetRecord,
  monthBudget,
  monthRecord,
  nextToPlan,
} from './month-budget.ts'

const october: MonthBudgetRecord = {
  start: '2026-10-01',
  targets: [{ line: 'eat', amount: 240_000 }],
  income: 3_841_142,
  lockedAt: '2026-10-20T16:00:00.000Z',
}
const novemberDraft: MonthBudgetRecord = {
  start: '2026-11-01',
  targets: [{ line: 'rent', amount: 1_100_000 }],
  income: 3_841_142,
}

describe('BUD-70 to BUD-74: a budget for each month', () => {
  it('BUD-70: before the first lock-in, this month is a draft from the starting amounts', () => {
    expect(monthBudget([], '2026-10-01', '2026-10-01')).toEqual({
      start: '2026-10-01',
      state: 'draft',
      budget: null,
      from: null,
      record: null,
    })
  })

  it('BUD-71: a month locked in keeps its own targets and income', () => {
    const month = monthBudget([october], '2026-10-01', '2026-10-01')
    expect(month.state).toBe('locked')
    expect(month.budget?.targets.get('eat')).toBe(240_000)
    expect(month.budget?.income).toBe(3_841_142)
  })

  it('BUD-70: a month ahead starts from its own draft, else the last budget before it', () => {
    const records = [october, novemberDraft]
    const november = monthBudget(records, '2026-11-01', '2026-10-01')
    expect(november.state).toBe('draft')
    expect(november.budget?.targets.get('rent')).toBe(1_100_000)
    // November's draft isn't in force yet, so December starts from October.
    const december = monthBudget(records, '2026-12-01', '2026-10-01')
    expect(december).toMatchObject({ state: 'draft', from: '2026-10-01' })
    expect(december.budget?.targets.get('eat')).toBe(240_000)
  })

  it('BUD-73: a month that begins without a lock-in carries on with its draft, else the last budget', () => {
    const records = [october, novemberDraft]
    const november = monthBudget(records, '2026-11-01', '2026-11-01')
    expect(november).toMatchObject({ state: 'carried', from: null })
    expect(november.budget?.targets.get('rent')).toBe(1_100_000)
    const january = monthBudget(records, '2027-01-01', '2027-01-01')
    expect(january).toMatchObject({ state: 'carried', from: '2026-11-01' })
    expect(budgeted(january)).toBe(true)
  })

  it('BUD-73: without carrying on, a month has a budget only once locked in', () => {
    const records = [october, novemberDraft]
    expect(monthBudget(records, '2026-11-01', '2026-11-01', false).state).toBe('draft')
    expect(monthBudget(records, '2026-12-01', '2027-01-01', false).state).toBe('none')
  })

  it('BUD-74: a month gone by before the first budget has none', () => {
    const september = monthBudget([october], '2026-09-01', '2026-10-01')
    expect(september.state).toBe('none')
    expect(budgeted(september)).toBe(false)
    // A draft that never came into force doesn't count either.
    const lone = { ...novemberDraft, start: '2026-08-01' }
    expect(monthBudget([lone, october], '2026-08-01', '2026-10-01').state).toBe('none')
  })

  it('BUD-70, BUD-74: the month bar runs from the first budget to 12 months ahead', () => {
    expect(budgetMonths([october], '2026-12-01', 1)).toEqual({
      first: '2026-10-01',
      last: '2027-12-01',
    })
    expect(budgetMonths([], '2026-10-01', 1)).toEqual({ first: '2026-10-01', last: '2027-10-01' })
  })

  it('BUD-71: a budget keeps every line with a target, in order', () => {
    expect(
      monthRecord(
        '2026-11-01',
        new Map([
          ['rent', 1_100_000],
          ['eat', 240_000],
          ['gift', 0],
        ]),
        3_841_142,
      ),
    ).toEqual({
      start: '2026-11-01',
      targets: [
        { line: 'eat', amount: 240_000 },
        { line: 'rent', amount: 1_100_000 },
      ],
      income: 3_841_142,
    })
  })
})

describe('BUD-75: planning the next month before it begins', () => {
  const current = { start: '2026-10-01', end: '2026-10-31' }

  it('BUD-75: asks for next month’s budget from 14 days before it begins', () => {
    expect(nextToPlan([october], current, '2026-10-20', 1)).toEqual({
      start: '2026-11-01',
      days: 12,
    })
    expect(nextToPlan([october], current, '2026-10-10', 1)).toBeNull()
  })

  it('BUD-75: a draft still asks; a month locked in doesn’t', () => {
    expect(nextToPlan([october, novemberDraft], current, '2026-10-20', 1)).not.toBeNull()
    const locked = { ...novemberDraft, lockedAt: '2026-10-20T17:00:00.000Z' }
    expect(nextToPlan([october, locked], current, '2026-10-20', 1)).toBeNull()
  })
})
