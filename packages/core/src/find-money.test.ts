import { describe, expect, it } from 'vitest'
import type { LineBaseline } from './budget.ts'
import type { Flexibility } from './categories.ts'
import {
  closeTheGap,
  fewerPurchases,
  goalOffers,
  lastTimeAtMost,
  monthsPerFewerPurchase,
  perWeekAndYear,
} from './find-money.ts'
import { fundGoals, type Goal } from './goals.ts'

const month = (start: string, spent: number) => ({
  period: { start, end: `${start.slice(0, 8)}28` },
  spent,
  oneOff: 0,
  excluded: false,
})

function usual(key: string, value: number, proven: number, provenMonth: string): LineBaseline {
  return {
    key,
    categoryId: key,
    tagId: null,
    baseline: value,
    withOneOffs: value,
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

describe('BUD-34: cuts said as habits', () => {
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

  it('BUD-35: cuts come off the month’s own target, not the usual month', () => {
    // 10% of a 6,000 target, where the usual month (6,212) would give 6,212.
    const plan = closeTheGap([line('dates', 'flexible', 600_000)], history, 50_000, 0.15)
    expect(plan.cuts).toMatchObject([{ line: 'dates', cut: 60_000, newTarget: 540_000 }])
  })

  it('BUD-35: never cuts below what the month has already spent', () => {
    // 15% would be 93,180, but 580,000 is gone already: only 41,200 is still free.
    const spentDates = { ...line('dates', 'flexible', 621_200), spent: 580_000 }
    const over = { ...line('shopping', 'flexible', 362_700), spent: 400_000 }
    const plan = closeTheGap([spentDates, over], history, 500_000, 0.15)
    expect(plan.cuts).toMatchObject([{ line: 'dates', cut: 41_200, newTarget: 580_000 }])
  })
})

describe('BUD-34 to BUD-36: what the cuts mean for the goals', () => {
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
