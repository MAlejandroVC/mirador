import { describe, expect, it } from 'vitest'
import {
  carryOver,
  type ClosedLine,
  goalDates,
  missedInARow,
  surplusByOrder,
} from './period-close.ts'

const want = (line: string, target: number, spent: number): ClosedLine => ({
  line,
  flexibility: 'flexible',
  target,
  spent,
})

describe('BUD-50 to BUD-57: closing a month', () => {
  it('BUD-51: the extra goes to the goals in order, up to what each still lacked', () => {
    expect(
      surplusByOrder(176_800, [
        { goalId: 'invest', unmet: 162_800 },
        { goalId: 'trip', unmet: 50_000 },
        { goalId: 'car', unmet: 0 },
      ]),
    ).toEqual([
      { goalId: 'invest', amount: 162_800 },
      { goalId: 'trip', amount: 14_000 },
      { goalId: 'car', amount: 0 },
    ])
    // Nothing extra, nothing sent.
    expect(surplusByOrder(-5_000, [{ goalId: 'trip', unmet: 50_000 }])).toEqual([
      { goalId: 'trip', amount: 0 },
    ])
  })

  it('BUD-52: only the lines chosen carry what was left, or minus what went over', () => {
    const lines = [want('eat', 472_300, 490_300), want('clothes', 362_700, 236_700)]
    expect(carryOver(lines, new Set())).toEqual([])
    expect(carryOver(lines, new Set(['eat', 'clothes']))).toEqual([
      { line: 'eat', amount: -18_000 },
      { line: 'clothes', amount: 126_000 },
    ])
  })

  it('BUD-54: a Want over target 3 months in a row gets an easier target', () => {
    const months = [
      [want('eat', 472_300, 500_000), want('gas', 515_200, 400_000)],
      [want('eat', 472_300, 510_000), want('gas', 515_200, 600_000)],
      [
        want('eat', 472_300, 490_300),
        want('gas', 515_200, 600_000),
        { line: 'rent', flexibility: 'locked', target: 1_000, spent: 2_000 } satisfies ClosedLine,
      ],
    ]
    expect(missedInARow(months)).toEqual([
      { line: 'eat', spent: [500_000, 510_000, 490_300], target: 472_300, eased: 500_000 },
    ])
    expect(missedInARow(months.slice(1))).toEqual([])
  })

  it('BUD-57: how each goal’s date moved from one close to the next', () => {
    expect(
      goalDates([
        { start: '2026-10-01', goals: [{ goalId: 'car', name: 'Car', projected: '2027-11-30' }] },
        {
          start: '2026-09-01',
          goals: [
            { goalId: 'car', name: 'Old car', projected: '2027-10-31' },
            { goalId: 'trip', name: 'Trip' },
          ],
        },
      ]),
    ).toEqual([
      {
        goalId: 'car',
        name: 'Car',
        dates: [
          { start: '2026-09-01', projected: '2027-10-31' },
          { start: '2026-10-01', projected: '2027-11-30' },
        ],
      },
      { goalId: 'trip', name: 'Trip', dates: [{ start: '2026-09-01', projected: null }] },
    ])
  })
})
