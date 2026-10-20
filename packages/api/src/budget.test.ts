import { describe, expect, it } from 'vitest'
import { budgetPlanRecord, goalRecord, planLine, scenarioRecord } from './budget.ts'
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

  it('BUD-37: a cut is phased over 1 to 12 months', () => {
    const plan = {
      targets: [],
      adjustments: [{ line: id, change: -100, steps: 3, from: '2026-11-01' }],
      exclusions: { periods: [], linePeriods: [], transactionIds: [] },
      tagLines: [],
    }
    expect(budgetPlanRecord.safeParse(plan).success).toBe(true)
    expect(
      budgetPlanRecord.safeParse({ ...plan, adjustments: [{ ...plan.adjustments[0], steps: 0 }] })
        .success,
    ).toBe(false)
    expect(
      scenarioRecord.safeParse({
        name: 'Less eating out',
        changes: [],
        goals: [],
        unlocked: [],
        flexibility: [],
        steps: 1,
      }).success,
    ).toBe(true)
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
