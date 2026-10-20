import { describe, expect, it } from 'vitest'
import {
  affordability,
  type Contribution,
  contributedIn,
  fundGoals,
  type Goal,
  goalProgress,
  monthsBetween,
  payoff,
  principalFor,
  walletGoalBalances,
} from './goals.ts'
import type { Transaction } from './transactions.ts'

const october = { start: '2026-10-01', end: '2026-10-31' }

function goal(patch: Partial<Goal> & Pick<Goal, 'id'>): Goal {
  return {
    name: patch.id,
    kind: 'save',
    saved: 0,
    walletIds: [],
    start: '2026-01-01',
    order: 0,
    ...patch,
  }
}

// Savings grew from 40,000 to 48,000 since the goal started on Jul 1.
const balances = {
  balance: (walletIds: readonly string[], date: string) => {
    if (walletIds.includes('card')) return date < '2026-07-01' ? -3_000_000 : -2_000_000
    if (!walletIds.includes('savings')) return 0
    if (date < '2026-07-01') return 4_000_000
    if (date < '2026-10-01') return 4_500_000
    return 4_800_000
  },
}

describe('BUD-25, BUD-26, BUD-46: goal progress', () => {
  it('BUD-25: a goal linked to a wallet counts its growth since the goal started', () => {
    const car = goal({ id: 'car', walletIds: ['savings'], start: '2026-07-01', saved: 1_000_000 })
    expect(goalProgress(car, [], balances, '2026-10-19')).toBe(1_000_000 + 800_000)
    expect(contributedIn(car, [], balances, october, '2026-10-19')).toBe(300_000)
  })

  it('BUD-26: a goal without a wallet counts the money added to it', () => {
    const trip = goal({ id: 'trip', saved: 500_000 })
    const added: Contribution[] = [
      { id: 'a', goalId: 'trip', amount: 200_000, date: '2026-09-15' },
      { id: 'b', goalId: 'trip', amount: 100_000, date: '2026-10-02' },
      { id: 'c', goalId: 'other', amount: 999_999, date: '2026-10-02' },
    ]
    expect(goalProgress(trip, added, balances, '2026-10-19')).toBe(800_000)
    expect(contributedIn(trip, added, balances, october, '2026-10-19')).toBe(100_000)
  })

  it('BUD-28: paying off a debt counts how much less is owed', () => {
    const card = goal({
      id: 'card',
      kind: 'debt',
      walletIds: ['card'],
      start: '2026-07-01',
      target: 3_000_000,
    })
    expect(goalProgress(card, [], balances, '2026-10-19')).toBe(1_000_000)
  })
})

describe('BUD-25: wallet balances for goals', () => {
  it('BUD-25: a balance on any date, other currencies at the rate in use', () => {
    const wallets = [
      { id: 'savings', currency: 'MXN', features: [] },
      { id: 'dollars', currency: 'USD', features: [] },
    ]
    const move = (id: string, walletId: string, amount: number, date: string) =>
      ({ id, walletId, amount, date }) as Transaction
    const balances = walletGoalBalances(
      wallets,
      [move('a', 'savings', 100_000, '2026-09-01'), move('b', 'dollars', 1_000, '2026-09-02')],
      'MXN',
      [{ id: 'r', from: 'USD', to: 'MXN', rate: 18_000_000, date: '2026-09-01' }],
    )
    expect(balances.balance(['savings'], '2026-08-31')).toBe(0)
    expect(balances.balance(['savings'], '2026-09-30')).toBe(100_000)
    expect(balances.balance(['savings', 'dollars'], '2026-09-30')).toBe(100_000 + 18_000)
  })
})

describe('BUD-21 to BUD-24: funding goals from the left over', () => {
  it('BUD-21: a date divides what is left by the months left', () => {
    expect(monthsBetween('2026-10-01', '2027-03-31', 1)).toBe(6)
    const trip = goal({ id: 'trip', target: 3_000_000, by: '2027-03-31' })
    const result = fundGoals([trip], new Map([['trip', 1_200_000]]), 2_000_000, october, 1)
    expect(result.goals[0]?.need).toBe(300_000)
    expect(result.goals[0]?.funding).toBe('funded')
    expect(result.goals[0]?.projected).toBe('2027-03-31')
    expect(result.free).toBe(1_700_000)
  })

  it('BUD-22: a monthly amount projects the date it is reached', () => {
    const car = goal({ id: 'car', target: 12_000_000, perMonth: 1_000_000 })
    const result = fundGoals([car], new Map([['car', 4_800_000]]), 5_000_000, october, 1)
    // 7,200,000 left at 1,000,000 a month: the 8th month from October is May.
    expect(result.goals[0]?.projected).toBe('2027-05-31')
  })

  it('BUD-23, BUD-24: goals are funded in order; the rest are partly funded or unfunded', () => {
    const goals = [
      goal({ id: 'car', target: 12_000_000, perMonth: 1_000_000, order: 0 }),
      goal({ id: 'trip', target: 3_000_000, perMonth: 500_000, order: 1 }),
      goal({ id: 'invest', kind: 'invest', perMonth: 1_000_000, order: 2 }),
      goal({ id: 'later', target: 100_000, perMonth: 100_000, order: 3, paused: true }),
    ]
    const result = fundGoals(goals, new Map(), 2_337_200, october, 1)
    expect(result.goals.map((plan) => [plan.goal.id, plan.funding, plan.funded])).toEqual([
      ['car', 'funded', 1_000_000],
      ['trip', 'funded', 500_000],
      ['invest', 'partly', 837_200],
    ])
    expect(result.need).toBe(2_500_000)
    expect(result.gap).toBe(162_800)
    expect(result.free).toBe(0)
    // An investment with no target has no end date.
    expect(result.goals[2]?.projected).toBeNull()
  })

  it('BUD-24: an underfunded goal with a date moves to when its funded pace reaches it', () => {
    const trip = goal({ id: 'trip', target: 1_200_000, by: '2026-12-31' })
    const result = fundGoals([trip], new Map(), 200_000, october, 1)
    expect(result.goals[0]?.need).toBe(400_000)
    expect(result.goals[0]?.funding).toBe('partly')
    expect(result.goals[0]?.projected).toBe('2027-03-31')
    expect(result.goals[0]?.onTime).toBe(false)
  })

  it('BUD-27: an emergency fund in months of Commitments and Needs', () => {
    const fund = goal({ id: 'fund', kind: 'emergency', months: 3, perMonth: 500_000 })
    const result = fundGoals([fund], new Map(), 1_000_000, october, 1, 2_000_000)
    expect(result.goals[0]?.target).toBe(6_000_000)
  })
})

describe('BUD-28, BUD-60 to BUD-66: debts and what you can afford', () => {
  it('BUD-28: a debt paid at a monthly amount with interest', () => {
    expect(payoff(1_000_000, 100_000, 0.02)).toEqual({
      months: 12,
      interest: expect.any(Number) as number,
    })
    expect(payoff(1_000_000, 20_000, 0.02)).toBeNull()
  })

  it('BUD-61 to BUD-63: the acceptance example', () => {
    const result = affordability({
      savings: 10_012_600,
      buffer: 3_000_000,
      heldForGoals: 0,
      free: 837_200,
      monthlyRate: 0.01,
      payments: 48,
    })
    expect(result.downPayment).toBe(7_012_600)
    expect(result.payment.maximum).toBe(837_200)
    // About 388,000: 70,126 down plus a 317,9xx loan.
    expect(Math.round(result.price.maximum / 100_000)).toBe(388)
    // BUD-64: comfortable keeps 10% of the free left over unspent.
    expect(result.payment.comfortable).toBe(753_480)
    expect(principalFor(100_000, 10, 0)).toBe(1_000_000)
  })
})
