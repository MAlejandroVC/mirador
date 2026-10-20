import { describe, expect, it } from 'vitest'
import { type Adjustment, adjustmentIn, type LineBaseline } from './budget.ts'
import type { Flexibility } from './categories.ts'
import {
  applyScenario,
  canChange,
  changedTarget,
  closeTheGap,
  emptyScenario,
  changedGoals,
  fewerPurchases,
  monthsPerFewerPurchase,
  goalOffers,
  heldAt,
  lastTimeAtMost,
  perWeekAndYear,
  scenarioAdjustments,
} from './scenarios.ts'
import { fundGoals, type Goal } from './goals.ts'

const month = (start: string, spent: number) => ({
  period: { start, end: `${start.slice(0, 8)}28` },
  spent,
  excluded: false,
})

function usual(key: string, value: number, proven: number, provenMonth: string): LineBaseline {
  return {
    key,
    categoryId: key,
    tagId: null,
    baseline: value,
    spread: false,
    median: value,
    proven,
    provenPeriod: null,
    highest: value,
    highestPeriod: null,
    trend: 0,
    share: 0.2,
    averageTicket: 76_000,
    purchasesPerMonth: 2,
    variability: 0,
    months: [month('2026-04-01', value), month(provenMonth, proven), month('2026-09-01', value)],
  }
}

const line = (key: string, flexibility: Flexibility, target: number) => ({
  key,
  categoryId: key,
  flexibility,
  target,
  base: target,
})
const lines = [
  line('dates', 'flexible', 621_200),
  line('shopping', 'flexible', 362_700),
  line('gas', 'flexible', 515_200),
  line('rent', 'locked', 1_450_000),
  line('food', 'fixed', 400_000),
]
const history = [
  usual('dates', 621_200, 490_000, '2026-06-01'),
  usual('shopping', 362_700, 280_000, '2026-05-01'),
  usual('gas', 515_200, 495_000, '2026-07-01'),
  usual('rent', 1_450_000, 1_450_000, '2026-07-01'),
  usual('food', 400_000, 300_000, '2026-07-01'),
]

describe('BUD-30 to BUD-34: what-ifs', () => {
  it('BUD-30: a change by a share, an amount or to a new target', () => {
    expect(changedTarget(100_000, { line: 'x', kind: 'percent', value: -0.15 })).toBe(85_000)
    expect(changedTarget(100_000, { line: 'x', kind: 'amount', value: -30_000 })).toBe(70_000)
    expect(changedTarget(100_000, { line: 'x', kind: 'target', value: 60_000 })).toBe(60_000)
  })

  it('BUD-32, BUD-33: changes free money; a Commitment changes only once unlocked', () => {
    const scenario = {
      ...emptyScenario,
      changes: [
        { line: 'food', kind: 'amount' as const, value: -50_000 },
        { line: 'rent', kind: 'amount' as const, value: -100_000 },
      ],
    }
    expect(canChange(lines[3]!, scenario)).toBe(false)
    expect(applyScenario(lines, scenario).freed).toBe(50_000)
    const unlocked = { ...scenario, unlocked: ['rent'] }
    expect(applyScenario(lines, unlocked).freed).toBe(150_000)
    // BUD-31: a new expense adds to a line's target.
    const added = {
      ...emptyScenario,
      changes: [{ line: 'gym', kind: 'amount' as const, value: 60_000 }],
    }
    expect(applyScenario(lines, added).freed).toBe(-60_000)
    expect(applyScenario(lines, added).targets.get('gym')).toBe(60_000)
  })

  it('BUD-34: per week, per year and in purchases', () => {
    expect(perWeekAndYear(93_200)).toEqual({ week: 21_508, year: 1_118_400 })
    expect(fewerPurchases(93_200, 76_000)).toBe(1)
  })

  it('BUD-34: a cut smaller than one purchase counts the months per purchase saved', () => {
    expect(fewerPurchases(21_273, 150_000)).toBe(0)
    expect(monthsPerFewerPurchase(21_273, 150_000)).toBe(7)
    expect(monthsPerFewerPurchase(0, 150_000)).toBe(0)
    expect(monthsPerFewerPurchase(21_273, 0)).toBe(0)
  })
})

describe('BUD-35, BUD-36: closing the gap', () => {
  it('BUD-35: the acceptance example', () => {
    const plan = closeTheGap(lines, history, 162_800, 0.15)
    expect(plan.freed).toBeGreaterThanOrEqual(162_800)
    expect(plan.short).toBe(0)
    for (const cut of plan.cuts) {
      const line = history.find((item) => item.key === cut.line)
      expect(cut.share).toBeLessThanOrEqual(0.15 + 1e-9)
      expect(cut.newTarget).toBeGreaterThanOrEqual(line?.proven ?? 0)
    }
    // No Commitment or Need is touched.
    expect(plan.cuts.map((cut) => cut.line)).toEqual(['dates', 'shopping', 'gas'])
    expect(plan.cuts[0]).toMatchObject({ cut: 93_180, lastTime: { spent: 490_000 } })
    expect(plan.cuts[0]?.lastTime?.period.start).toBe('2026-06-01')
  })

  it('BUD-36: says how much is still short', () => {
    const plan = closeTheGap(lines, history, 1_000_000, 0.15)
    expect(plan.short).toBe(1_000_000 - plan.freed)
    expect(plan.short).toBeGreaterThan(0)
  })

  it('BUD-11: a Need treated as a Want in this what-if can be suggested', () => {
    const scenario = {
      ...emptyScenario,
      flexibility: [{ categoryId: 'food', flexibility: 'flexible' as const }],
    }
    const plan = closeTheGap(lines, history, 1_000_000, 0.15, scenario)
    expect(plan.cuts.map((cut) => cut.line)).toContain('food')
  })
})

describe('BUD-31, BUD-36, BUD-37, BUD-39: from a what-if to the plan', () => {
  const goal = (patch: Partial<Goal> & Pick<Goal, 'id'>): Goal => ({
    name: patch.id,
    kind: 'save',
    saved: 0,
    walletIds: [],
    start: '2026-01-01',
    order: 0,
    ...patch,
  })

  it('BUD-34, BUD-35: the last month a line spent no more than a target', () => {
    const dates = history[0]!
    expect(lastTimeAtMost(dates, 500_000)?.period.start).toBe('2026-06-01')
    expect(lastTimeAtMost(dates, 100_000)).toBeNull()
  })

  it('BUD-31: a goal changed to a monthly amount loses its date', () => {
    const [changed] = changedGoals(
      [goal({ id: 'car', target: 100, by: '2027-01-31' })],
      [{ goalId: 'car', perMonth: 10, target: 200 }],
    )
    expect(changed).toEqual(goal({ id: 'car', target: 200, perMonth: 10 }))
  })

  it('BUD-37, BUD-39: cuts phase in over the steps; a new expense starts at once', () => {
    const scenario = {
      ...emptyScenario,
      steps: 3,
      changes: [
        { line: 'dates', kind: 'percent' as const, value: -0.15 },
        { line: 'gym', kind: 'amount' as const, value: 60_000 },
        { line: 'rent', kind: 'amount' as const, value: -100_000 },
      ],
    }
    expect(scenarioAdjustments(lines, scenario, '2026-11-01')).toEqual([
      { line: 'dates', change: -93_180, steps: 3, from: '2026-11-01' },
      { line: 'gym', change: 60_000, steps: 1, from: '2026-11-01' },
    ])
  })

  it('BUD-37, BUD-39: a line already phasing in is held where it stands and the new change takes over', () => {
    // October: dates is two thirds into a $900 cut, so its target is $5,612.
    const existing: Adjustment[] = [
      { line: 'dates', change: -90_000, steps: 3, from: '2026-09-01' },
      { line: 'gas', change: -20_000, steps: 1, from: '2026-09-01' },
      { line: 'dates', change: -5_000, steps: 1, from: '2026-12-01' },
    ]
    const now = [
      { ...line('dates', 'flexible', 561_200), base: 621_200 },
      line('gas', 'flexible', 495_200),
    ]
    const scenario = {
      ...emptyScenario,
      changes: [{ line: 'dates', kind: 'target' as const, value: 500_000 }],
    }
    const adjustments = scenarioAdjustments(now, scenario, '2026-11-01', existing, 1)
    expect(adjustments).toEqual([
      existing[1],
      { line: 'dates', change: -60_000, steps: 2, from: '2026-09-01' },
      { line: 'dates', change: -61_200, steps: 1, from: '2026-11-01' },
    ])
    const target = (start: string) =>
      621_200 +
      adjustments
        .filter((item) => item.line === 'dates')
        .reduce((sum, item) => sum + adjustmentIn(item, start, 1), 0)
    // The months before stay as they were; from November on it is the what-if's target.
    expect(target('2026-09-01')).toBe(591_200)
    expect(target('2026-10-01')).toBe(561_200)
    expect(target('2026-11-01')).toBe(500_000)
    expect(target('2027-01-01')).toBe(500_000)
    expect(heldAt(existing[0]!, '2026-08-01', 1)).toBeNull()
  })

  it('BUD-36: an underfunded goal can move to its funded date or ask for less', () => {
    const october = { start: '2026-10-01', end: '2026-10-31' }
    const funding = fundGoals(
      [
        goal({ id: 'trip', target: 1_200_000, by: '2026-12-31', order: 0 }),
        goal({ id: 'invest', perMonth: 500_000, order: 1 }),
      ],
      new Map(),
      200_000,
      october,
      1,
    )
    expect(goalOffers(funding, october, 1)).toEqual([
      { kind: 'later', change: { goalId: 'trip', by: '2027-03-31' } },
      { kind: 'lower', change: { goalId: 'trip', target: 600_000 } },
    ])
  })
})
