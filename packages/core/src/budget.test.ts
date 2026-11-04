import { describe, expect, it } from 'vitest'
import type { AnalysisEntry, AnalysisView } from './analysis.ts'
import {
  baseline,
  committedTo,
  coverage,
  defaultBudgetSettings,
  emptyPlan,
  findOneOffs,
  lineKey,
  lineOf,
  type MonthTargets,
  type PlanSettings,
  planMonth,
  planSplit,
} from './budget.ts'
import type { CommittedItem } from './outlook.ts'
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

describe('BUD-01 to BUD-08: the starting amounts', () => {
  // Restaurants: Apr 4,650, May 4,800, Jun 2,659, Jul 5,840, Aug 9,900, Sep 4,723.
  const months = ['04', '05', '06', '07', '08', '09']
  const amounts = [465_000, 480_000, 265_900, 584_000, 990_000, 472_300]
  const entries = [
    ...months.map((month, index) => entry(`2026-${month}-10`, 'eat', amounts[index] ?? 0)),
    // A gift in July only.
    entry('2026-07-20', 'gift', 600_000),
    ...months.map((month) => entry(`2026-${month}-01`, 'salary', 5_800_000)),
  ]
  // A 15,000 dinner in September, over 3 times the usual 4,800.
  const dinner = entry('2026-09-14', 'eat', 1_500_000)

  it('BUD-01: the average of the last 6 complete months', () => {
    const usual = baseline(entries, view('2026-10-19'))
    const eat = usual.lines.find((line) => line.key === 'eat')
    expect(usual.periods).toHaveLength(6)
    expect(eat?.baseline).toBe(542_867)
    expect(eat?.median).toBe(476_150)
  })

  it('BUD-01: 3 months when the person picks 3', () => {
    const usual = baseline(entries, view('2026-10-19'), { lookback: 3 })
    expect(usual.periods.map((period) => period.start)).toEqual([
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
    ])
    expect(usual.lines.find((line) => line.key === 'eat')?.baseline).toBe(682_100)
  })

  it('BUD-02: a purchase over 3 times the usual one is a one-off and stays out of the starting amount', () => {
    const usual = baseline([...entries, dinner], view('2026-10-19'))
    const eat = usual.lines.find((line) => line.key === 'eat')
    expect(usual.oneOffs).toContainEqual({
      transactionId: dinner.transactionId,
      line: 'eat',
      date: '2026-09-14',
      amount: 1_500_000,
      reason: 'large',
      usual: 480_000,
      counted: false,
    })
    expect(eat?.baseline).toBe(542_867)
    expect(eat?.withOneOffs).toBe(792_867)
    // It still counts in September, as its one-off part.
    expect(eat?.months.at(-1)).toMatchObject({ spent: 1_972_300, oneOff: 1_500_000 })
  })

  it('BUD-02: a line’s only purchase in the months looked at is a one-off; a recurring one never is', () => {
    const gift = baseline(entries, view('2026-10-19')).lines.find((line) => line.key === 'gift')
    expect(gift?.baseline).toBe(0)
    expect(gift?.withOneOffs).toBe(100_000)
    const yearly = entries.map((item) =>
      item.categoryId === 'gift' ? { ...item, recurringId: 'insurance' } : item,
    )
    expect(findOneOffs(yearly, baseline(yearly, view('2026-10-19')).counted, [])).toEqual([])
    expect(
      baseline(yearly, view('2026-10-19')).lines.find((line) => line.key === 'gift')?.baseline,
    ).toBe(100_000)
  })

  it('BUD-76: a one-off counted after all raises the starting amount', () => {
    const usual = baseline([...entries, dinner], view('2026-10-19'), {
      exclusions: {
        periods: [],
        linePeriods: [],
        transactionIds: [],
        counted: [dinner.transactionId],
      },
    })
    expect(usual.lines.find((line) => line.key === 'eat')?.baseline).toBe(792_867)
    expect(usual.oneOffs.find((item) => item.line === 'eat')?.counted).toBe(true)
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
    expect(eat?.baseline).toBe(453_440)
    expect(eat?.highest).toBe(584_000)
    expect(eat?.highestPeriod?.start).toBe('2026-07-01')
    expect(eat?.proven).toBe(265_900)
    expect(eat?.provenPeriod?.start).toBe('2026-06-01')
    expect(eat?.months.find((month) => month.period.start === '2026-08-01')?.excluded).toBe(true)
  })

  it('BUD-03: a transaction left out by hand stops counting', () => {
    const august = entries.find((item) => item.date === '2026-08-10')
    const usual = baseline(entries, view('2026-10-19'), {
      exclusions: { periods: [], linePeriods: [], transactionIds: [august?.transactionId ?? ''] },
    })
    // August now counts as nothing for Restaurants.
    expect(usual.lines.find((line) => line.key === 'eat')?.baseline).toBe(377_867)
  })

  it('BUD-05: the usual income is the median income', () => {
    expect(baseline(entries, view('2026-10-19')).income).toBe(5_800_000)
  })

  it('BUD-07: share, trend and the usual purchase', () => {
    const usual = baseline(entries, view('2026-10-19'))
    const eat = usual.lines.find((line) => line.key === 'eat')
    // The gift is a one-off, so Restaurants is all of the usual spending.
    expect(eat?.share).toBe(1)
    expect(eat?.trend).toBeGreaterThan(0)
    expect(eat?.averageTicket).toBe(542_867)
    // One purchase in each of the 6 months.
    expect(eat?.purchasesPerMonth).toBe(1)
  })

  it('BUD-08: a tag line takes its tagged spending out of the category line', () => {
    const tagged = [
      entry('2026-08-12', 'eat', 50_000, { tagIds: ['work'] }),
      entry('2026-09-12', 'eat', 50_000, { tagIds: ['work'] }),
    ]
    const tagLines = [{ categoryId: 'eat', tagId: 'work' }]
    expect(lineOf(tagged[0]!, tagLines)).toBe(lineKey('eat', 'work'))
    expect(lineOf(entries[0]!, tagLines)).toBe('eat')
    const usual = baseline([...entries, ...tagged], view('2026-10-19'), { tagLines })
    expect(usual.lines.find((line) => line.key === 'eat~work')?.baseline).toBe(16_667)
    expect(usual.lines.find((line) => line.key === 'eat')?.baseline).toBe(542_867)
  })
})

describe('BUD-40 to BUD-44: a month’s budget against its spending', () => {
  const history = ['04', '05', '06', '07', '08', '09'].flatMap((month) => [
    entry(`2026-${month}-03`, 'rent', 1_450_000),
    entry(`2026-${month}-05`, 'food', 200_000),
    entry(`2026-${month}-25`, 'food', 200_000),
    entry(`2026-${month}-08`, 'eat', 300_000),
    entry(`2026-${month}-01`, 'salary', 5_800_000),
  ])

  function plan(
    entries: readonly AnalysisEntry[],
    today: string,
    month: MonthTargets | null = null,
    options: Parameters<typeof planMonth>[7] = {},
    settings: PlanSettings = emptyPlan,
  ) {
    const usual = baseline(entries, view('2026-10-19'), settings)
    return planMonth(
      entries,
      view(today),
      categories,
      usual,
      settings,
      defaultBudgetSettings,
      month,
      options,
    )
  }

  it('BUD-40, BUD-41: without a budget, each target is its starting amount, with spent and left', () => {
    const october = [entry('2026-10-03', 'rent', 1_450_000), entry('2026-10-05', 'food', 150_000)]
    const month = plan([...history, ...october], '2026-10-19')
    const food = month.lines.find((line) => line.key === 'food')
    expect(food?.target).toBe(400_000)
    expect(food?.spent).toBe(150_000)
    expect(food?.left).toBe(250_000)
    expect(month.target).toBe(1_450_000 + 400_000 + 300_000)
    expect(month.income).toBe(5_800_000)
    expect(month.leftOver).toBe(5_800_000 - 2_150_000)
    expect(planSplit(month.lines)).toEqual({ locked: 1_450_000, fixed: 400_000, flexible: 300_000 })
  })

  it('BUD-40, BUD-70: a month’s budget sets every target and the income', () => {
    const october = [entry('2026-10-05', 'food', 150_000)]
    const month = plan([...history, ...october], '2026-10-19', {
      targets: new Map([
        ['eat', 250_000],
        ['rent', 1_450_000],
      ]),
      income: 6_500_000,
    })
    const eat = month.lines.find((line) => line.key === 'eat')
    expect(eat?.target).toBe(250_000)
    expect(eat?.starting).toBe(300_000)
    // Groceries has no target in this budget, so what it spent is over.
    expect(month.lines.find((line) => line.key === 'food')).toMatchObject({
      target: 0,
      left: -150_000,
    })
    expect(month.income).toBe(6_500_000)
    expect(month.leftOver).toBe(6_500_000 - 1_700_000)
  })

  it('BUD-42, BUD-43: pace follows the usual curve; heading over by more than 10% is at risk', () => {
    // Usually half of groceries is spent by the 19th; 390,000 by then heads for 590,000.
    const month = plan([...history, entry('2026-10-05', 'food', 390_000)], '2026-10-19')
    const food = month.lines.find((line) => line.key === 'food')
    expect(food?.projected).toBe(590_000)
    expect(food?.status).toBe('atRisk')
    const over = plan([...history, entry('2026-10-09', 'eat', 310_000)], '2026-10-19').lines.find(
      (line) => line.key === 'eat',
    )
    expect(over?.status).toBe('over')
    expect(over?.left).toBe(-10_000)
  })

  it('BUD-44: transactions left out of the budget are not counted', () => {
    const october = [
      entry('2026-10-05', 'food', 150_000),
      entry('2026-10-06', 'food', 900_000, { excluded: true }),
    ]
    expect(plan([...history, ...october], '2026-10-19').spent).toBe(150_000)
  })

  it('BUD-06: an estimate stands in until the line has a month of its own', () => {
    const settings = {
      ...emptyPlan,
      estimates: [
        { line: 'gift', amount: 50_000 },
        { line: 'eat', amount: 1 },
      ],
    }
    const month = plan(history, '2026-10-19', null, {}, settings)
    expect(month.lines.find((line) => line.key === 'gift')?.target).toBe(50_000)
    // Restaurants has six months of its own, so its estimate no longer counts.
    expect(month.lines.find((line) => line.key === 'eat')?.target).toBe(300_000)
  })

  it('BUD-70: a budget being made shows every line there was spending to start from', () => {
    // The gift was the only one in 6 months, so it starts at nothing.
    const entries = [...history, entry('2026-07-20', 'gift', 600_000)]
    expect(plan(entries, '2026-11-05').lines.some((line) => line.key === 'gift')).toBe(false)
    expect(
      plan(entries, '2026-11-05', null, { all: true }).lines.find((line) => line.key === 'gift'),
    ).toMatchObject({ target: 0, starting: 0 })
  })

  it('BUD-52: an amount carried over changes this month’s target', () => {
    const month = plan(history, '2026-10-19', null, { carry: [{ line: 'eat', amount: 60_000 }] })
    const eat = month.lines.find((line) => line.key === 'eat')
    expect(eat?.target).toBe(360_000)
    expect(eat?.base).toBe(300_000)
    expect(eat?.carry).toBe(60_000)
  })
})

describe('BUD-77: what helps set a month’s target', () => {
  const month = (start: string, spent: number, excluded = false) => ({
    period: periodOf(start, 'month', 0, 1),
    spent,
    oneOff: 0,
    excluded,
  })

  it('BUD-77: counts the months a target would have been enough for, left-out ones aside', () => {
    const months = [
      month('2026-05-01', 380_000),
      month('2026-06-01', 420_000),
      month('2026-07-01', 900_000, true),
      month('2026-08-01', 400_000),
    ]
    expect(coverage({ months }, 400_000)).toEqual({ covered: 2, months: 3 })
    expect(coverage({ months }, 0)).toEqual({ covered: 0, months: 3 })
  })

  it('BUD-77: adds up what is already committed to a line in the month, by its tags', () => {
    const item = (date: string, categoryId: string, amount: number, tagIds: string[] = []) =>
      ({
        date,
        amount,
        source: 'installment',
        id: date,
        categoryId,
        tagIds,
        payeeId: null,
        note: null,
      }) satisfies CommittedItem
    const items = [
      item('2026-12-05', 'eat', 20_000),
      item('2026-12-20', 'eat', 30_000, ['trip']),
      item('2027-01-05', 'eat', 20_000),
      item('2026-12-09', 'food', 50_000),
    ]
    const december = periodOf('2026-12-01', 'month', 0, 1)
    const tagLines = [{ categoryId: 'eat', tagId: 'trip' }]
    expect(committedTo(items, december, 'eat', tagLines)).toEqual({ amount: 20_000, count: 1 })
    expect(committedTo(items, december, lineKey('eat', 'trip'), tagLines)).toEqual({
      amount: 30_000,
      count: 1,
    })
    expect(committedTo(items, december, 'eat', [])).toEqual({ amount: 50_000, count: 2 })
  })
})
