import { describe, expect, it } from 'vitest'
import type { AnalysisEntry, AnalysisView } from './analysis.ts'
import {
  adjustmentIn,
  baseline,
  defaultBudgetSettings,
  emptyPlan,
  lineKey,
  lineOf,
  planMonth,
  planSplit,
} from './budget.ts'
import type { Category } from './categories.ts'
import { budgetMonthOf, periodOf, shiftPeriod } from './dates.ts'

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
    id: 'eat',
    name: 'Restaurants',
    groupId: 'fun',
    kind: 'expense',
    icon: 'fork',
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
    id: 'gift',
    name: 'Gifts',
    groupId: 'fun',
    kind: 'expense',
    icon: 'gift',
    flexibility: 'flexible',
  },
  {
    id: 'salary',
    name: 'Salary',
    groupId: 'income',
    kind: 'income',
    icon: 'money',
    flexibility: 'fixed',
  },
]

let count = 0
function entry(
  date: string,
  categoryId: string | null,
  spent: number,
  extra: Partial<AnalysisEntry> = {},
): AnalysisEntry {
  count += 1
  const category = categories.find((item) => item.id === categoryId)
  return {
    id: `t${String(count)}`,
    transactionId: `t${String(count)}`,
    date,
    spent: categoryId === 'salary' ? 0 : spent,
    earned: categoryId === 'salary' ? spent : 0,
    refund: false,
    categoryId,
    groupId: category?.groupId ?? null,
    flexibility: category?.flexibility ?? null,
    tagIds: [],
    payeeId: null,
    walletId: 'cash',
    note: null,
    recurringId: null,
    installment: false,
    excluded: false,
    ...extra,
  }
}

const view = (today: string, monthStart = 1): AnalysisView => ({
  period: periodOf(today, 'month', 0, monthStart),
  scope: 'month',
  firstDay: 0,
  monthStart,
  today,
  firstDate: '2026-01-01',
})

describe('SYS-02: budget months that start on a chosen day', () => {
  it('SYS-02: a month starting on the 15th runs to the 14th of the next', () => {
    expect(budgetMonthOf('2026-10-20', 15)).toEqual({ start: '2026-10-15', end: '2026-11-14' })
    expect(budgetMonthOf('2026-10-03', 15)).toEqual({ start: '2026-09-15', end: '2026-10-14' })
    expect(budgetMonthOf('2026-10-20', 1)).toEqual({ start: '2026-10-01', end: '2026-10-31' })
  })

  it('SYS-02: a start day past a short month starts on its last day', () => {
    expect(budgetMonthOf('2026-02-28', 31)).toEqual({ start: '2026-02-28', end: '2026-03-30' })
    expect(shiftPeriod('2026-01-31', 'month', 1, 0, 31)).toEqual({
      start: '2026-02-28',
      end: '2026-03-30',
    })
    expect(shiftPeriod('2026-02-28', 'month', 1, 0, 31).start).toBe('2026-03-31')
  })
})

describe('BUD-01 to BUD-08: the usual month', () => {
  // Restaurants: Apr 4,650, May 4,800, Jun 2,659, Jul 5,840, Aug 9,900, Sep 4,723.
  const months = ['04', '05', '06', '07', '08', '09']
  const amounts = [465_000, 480_000, 265_900, 584_000, 990_000, 472_300]
  const entries = [
    ...months.map((month, index) => entry(`2026-${month}-10`, 'eat', amounts[index] ?? 0)),
    // A yearly gift in July only.
    entry('2026-07-20', 'gift', 600_000),
    ...months.map((month) => entry(`2026-${month}-01`, 'salary', 5_800_000)),
  ]

  it('BUD-01: the median of the last 6 complete months', () => {
    const usual = baseline(entries, view('2026-10-19'))
    const eat = usual.lines.find((line) => line.key === 'eat')
    expect(usual.periods).toHaveLength(6)
    expect(eat?.baseline).toBe(476_150)
    expect(eat?.spread).toBe(false)
  })

  it('BUD-01: 3 months when the person picks 3', () => {
    const usual = baseline(entries, view('2026-10-19'), { lookback: 3 })
    expect(usual.periods.map((period) => period.start)).toEqual([
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
    ])
    expect(usual.lines.find((line) => line.key === 'eat')?.baseline).toBe(584_000)
  })

  it('BUD-02: a cost spent in fewer than half the months is spread evenly', () => {
    const gift = baseline(entries, view('2026-10-19')).lines.find((line) => line.key === 'gift')
    expect(gift?.spread).toBe(true)
    expect(gift?.baseline).toBe(100_000)
  })

  it('BUD-03, BUD-07: a month left out stops counting, and the proven level ignores it', () => {
    const usual = baseline(entries, view('2026-10-19'), {
      exclusions: {
        periods: [],
        linePeriods: [{ line: 'eat', start: '2026-08-01' }],
        transactionIds: [],
      },
    })
    const eat = usual.lines.find((line) => line.key === 'eat')
    expect(eat?.baseline).toBe(472_300)
    expect(eat?.highest).toBe(584_000)
    expect(eat?.highestPeriod?.start).toBe('2026-07-01')
    expect(eat?.proven).toBe(265_900)
    expect(eat?.provenPeriod?.start).toBe('2026-06-01')
    expect(eat?.months.find((month) => month.period.start === '2026-08-01')?.excluded).toBe(true)
  })

  it('BUD-03: a one-off transaction left out stops counting', () => {
    const august = entries.find((item) => item.date === '2026-08-10')
    const usual = baseline(entries, view('2026-10-19'), {
      exclusions: { periods: [], linePeriods: [], transactionIds: [august?.transactionId ?? ''] },
    })
    // August now counts as zero for Restaurants.
    expect(usual.lines.find((line) => line.key === 'eat')?.baseline).toBe(468_650)
  })

  it('BUD-05: the usual income is the median income', () => {
    expect(baseline(entries, view('2026-10-19')).income).toBe(5_800_000)
  })

  it('BUD-07: share, trend and the usual purchase', () => {
    const eat = baseline(entries, view('2026-10-19')).lines.find((line) => line.key === 'eat')
    expect(eat?.share).toBeCloseTo(476_150 / (476_150 + 100_000))
    expect(eat?.trend).toBeGreaterThan(0)
    expect(eat?.averageTicket).toBe(Math.round(amounts.reduce((a, b) => a + b, 0) / 6))
    // One purchase in each of the 6 months.
    expect(eat?.purchasesPerMonth).toBe(1)
  })

  it('BUD-08: a tag line takes its tagged spending out of the category line', () => {
    const tagged = entry('2026-09-12', 'eat', 50_000, { tagIds: ['work'] })
    const tagLines = [{ categoryId: 'eat', tagId: 'work' }]
    expect(lineOf(tagged, tagLines)).toBe(lineKey('eat', 'work'))
    expect(lineOf(entries[0]!, tagLines)).toBe('eat')
    const usual = baseline([...entries, tagged], view('2026-10-19'), { tagLines })
    // Spent in one month of six, so spread evenly; the category line keeps the rest.
    expect(usual.lines.find((line) => line.key === 'eat~work')?.baseline).toBe(8_333)
    expect(usual.lines.find((line) => line.key === 'eat~work')?.spread).toBe(true)
    expect(usual.lines.find((line) => line.key === 'eat')?.baseline).toBe(476_150)
  })
})

describe('BUD-40 to BUD-44: the plan for this month', () => {
  const history = ['04', '05', '06', '07', '08', '09'].flatMap((month) => [
    entry(`2026-${month}-03`, 'rent', 1_450_000),
    entry(`2026-${month}-05`, 'food', 200_000),
    entry(`2026-${month}-25`, 'food', 200_000),
    entry(`2026-${month}-08`, 'eat', 300_000),
    entry(`2026-${month}-01`, 'salary', 5_800_000),
  ])

  it('BUD-40, BUD-41: targets follow the usual month, with spent and left', () => {
    const october = [entry('2026-10-03', 'rent', 1_450_000), entry('2026-10-05', 'food', 150_000)]
    const { month } = planMonth(
      [...history, ...october],
      view('2026-10-19'),
      categories,
      emptyPlan,
      defaultBudgetSettings,
    )
    const food = month.lines.find((line) => line.key === 'food')
    expect(food?.target).toBe(400_000)
    expect(food?.spent).toBe(150_000)
    expect(food?.left).toBe(250_000)
    expect(month.target).toBe(1_450_000 + 400_000 + 300_000)
    expect(month.income).toBe(5_800_000)
    expect(month.leftOver).toBe(5_800_000 - 2_150_000)
    expect(planSplit(month.lines)).toEqual({ locked: 1_450_000, fixed: 400_000, flexible: 300_000 })
  })

  it('BUD-42, BUD-43: pace follows the usual curve; heading over by more than 10% is at risk', () => {
    // Usually half of groceries is spent by the 19th; 390,000 by then heads for 590,000.
    const october = [entry('2026-10-05', 'food', 390_000)]
    const { month } = planMonth(
      [...history, ...october],
      view('2026-10-19'),
      categories,
      emptyPlan,
      defaultBudgetSettings,
    )
    const food = month.lines.find((line) => line.key === 'food')
    expect(food?.projected).toBe(590_000)
    expect(food?.status).toBe('atRisk')
    const over = planMonth(
      [...history, entry('2026-10-09', 'eat', 310_000)],
      view('2026-10-19'),
      categories,
      emptyPlan,
      defaultBudgetSettings,
    ).month.lines.find((line) => line.key === 'eat')
    expect(over?.status).toBe('over')
    expect(over?.left).toBe(-10_000)
  })

  it('BUD-44: transactions left out of the budget are not counted', () => {
    const october = [
      entry('2026-10-05', 'food', 150_000),
      entry('2026-10-06', 'food', 900_000, { excluded: true }),
    ]
    const { month } = planMonth(
      [...history, ...october],
      view('2026-10-19'),
      categories,
      emptyPlan,
      defaultBudgetSettings,
    )
    expect(month.spent).toBe(150_000)
  })

  it('BUD-04, BUD-05: a hand-set target and expected income replace the usual ones', () => {
    const plan = {
      ...emptyPlan,
      targets: [{ line: 'eat', amount: 250_000, byHand: true }],
      income: 6_000_000,
      incomeByPeriod: [{ start: '2026-10-01', amount: 6_500_000 }],
    }
    const { month } = planMonth(
      history,
      view('2026-10-19'),
      categories,
      plan,
      defaultBudgetSettings,
    )
    const eat = month.lines.find((line) => line.key === 'eat')
    expect(eat?.target).toBe(250_000)
    expect(eat?.byHand).toBe(true)
    expect(month.income).toBe(6_500_000)
    expect(month.incomeSet).toBe(true)
    const november = planMonth(history, view('2026-11-05'), categories, plan, defaultBudgetSettings)
    expect(november.month.income).toBe(6_000_000)
  })

  it('BUD-37, BUD-40: a phased cut reaches its full size a step a month', () => {
    const adjustment = { line: 'eat', change: -45_000, steps: 3, from: '2026-10-01' }
    expect(adjustmentIn(adjustment, '2026-09-01', 1)).toBe(0)
    expect(adjustmentIn(adjustment, '2026-10-01', 1)).toBe(-15_000)
    expect(adjustmentIn(adjustment, '2026-11-01', 1)).toBe(-30_000)
    expect(adjustmentIn(adjustment, '2027-03-01', 1)).toBe(-45_000)
    const plan = { ...emptyPlan, adjustments: [adjustment] }
    const { month } = planMonth(
      history,
      view('2026-11-05'),
      categories,
      plan,
      defaultBudgetSettings,
    )
    expect(month.lines.find((line) => line.key === 'eat')?.target).toBe(270_000)
  })

  it('BUD-06: an estimate stands in until the line has a month of its own', () => {
    const plan = {
      ...emptyPlan,
      estimates: [
        { line: 'gift', amount: 50_000 },
        { line: 'eat', amount: 1 },
      ],
    }
    const { month } = planMonth(
      history,
      view('2026-10-19'),
      categories,
      plan,
      defaultBudgetSettings,
    )
    expect(month.lines.find((line) => line.key === 'gift')?.target).toBe(50_000)
    // Restaurants has six months of its own, so its estimate no longer counts.
    expect(month.lines.find((line) => line.key === 'eat')?.target).toBe(300_000)
  })

  it('BUD-52: an amount carried over changes this month’s target', () => {
    const { month } = planMonth(
      history,
      view('2026-10-19'),
      categories,
      emptyPlan,
      defaultBudgetSettings,
      [{ line: 'eat', amount: 60_000 }],
    )
    const eat = month.lines.find((line) => line.key === 'eat')
    expect(eat?.target).toBe(360_000)
    expect(eat?.carry).toBe(60_000)
  })
})
