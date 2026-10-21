import { describe, expect, it } from 'vitest'
import { budgetPlanRecord, goalRecord, monthBudgetRecord, planLine } from './budget.ts'
import { preferencesRecord } from './preferences.ts'

const id = '01920000-0000-7000-8000-000000000001'

describe('budget records', () => {
  it('BUD-08: a plan line is a category, or a category and a tag', () => {
    expect(planLine.safeParse(id).success).toBe(true)
    expect(planLine.safeParse(`${id}~${id}`).success).toBe(true)
    expect(planLine.safeParse(`${id}~${id}~${id}`).success).toBe(false)
  })

  it('BUD-21, BUD-22: a goal has a date or a monthly amount, not both', () => {
    const goal = {
      name: 'Car',
      kind: 'save',
      target: 100,
      saved: 0,
      walletIds: [],
      start: '2026-10-01',
      order: 0,
    }
    expect(goalRecord.safeParse({ ...goal, by: '2027-10-31' }).success).toBe(true)
    expect(goalRecord.safeParse({ ...goal, perMonth: 10 }).success).toBe(true)
    expect(goalRecord.safeParse({ ...goal, by: '2027-10-31', perMonth: 10 }).success).toBe(false)
    expect(goalRecord.safeParse({ ...goal, kind: 'afford' }).success).toBe(false)
  })

  it('BUD-70, BUD-71: a month’s budget holds its targets and income, locked in or a draft', () => {
    const month = {
      start: '2026-11-01',
      targets: [{ line: id, amount: 240_000 }],
      income: 3_841_142,
    }
    expect(monthBudgetRecord.safeParse(month).success).toBe(true)
    expect(
      monthBudgetRecord.safeParse({ ...month, lockedAt: '2026-10-20T16:00:00.000Z' }).success,
    ).toBe(true)
    expect(
      monthBudgetRecord.safeParse({ ...month, targets: [{ line: id, amount: -1 }] }).success,
    ).toBe(false)
    expect(monthBudgetRecord.safeParse({ ...month, start: '2026-11' }).success).toBe(false)
  })

  it('BUD-03, BUD-76: the plan keeps what it leaves out and the one-offs counted after all', () => {
    const plan = {
      exclusions: { periods: [], linePeriods: [], transactionIds: [], counted: [id] },
      tagLines: [],
    }
    expect(budgetPlanRecord.safeParse(plan).success).toBe(true)
  })

  it('SYS-02, SYS-09: budget settings travel with the preferences', () => {
    const budget = { startDay: 15, lookback: 6, maxCut: 0.15, atRisk: 0.1 }
    expect(preferencesRecord.parse({ defaultCurrency: 'MXN', budget }).budget).toEqual(budget)
    expect(
      preferencesRecord.safeParse({ defaultCurrency: 'MXN', budget: { ...budget, lookback: 5 } })
        .success,
    ).toBe(false)
  })
})
