import { describe, expect, it } from 'vitest'
import { addMonths, monthOf, nextDayOfMonth } from './dates.ts'
import {
  creditSummary,
  dueFees,
  type Fee,
  handleFee,
  type InterestSettings,
  interestForPeriod,
  loanPayment,
  loanProjection,
  nextFeeDate,
  valuationSummary,
} from './wallet-features.ts'

describe('dates', () => {
  it('WAL-15: a month later keeps the day, or the month end when it is shorter', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31')
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
    expect(nextDayOfMonth('2026-04-10', 31)).toBe('2026-04-30')
    expect(nextDayOfMonth('2026-04-10', 5)).toBe('2026-05-05')
    expect(monthOf('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
})

describe('wallet features', () => {
  const gat: InterestSettings = { rate: 1000, type: 'effective', compounding: 'daily' }
  const card: InterestSettings = { rate: 3600, type: 'nominal', compounding: 'monthly' }

  it('WAL-13: estimates the interest a balance earns or is charged this period', () => {
    const october = monthOf('2026-10-15')
    // 10,000.00 at a 10% GAT for October's 31 days: 1.1^(31/365) − 1 ≈ 0.81%.
    expect(interestForPeriod(1_000_000, gat, october)).toBe(8128)
    // 5,000.00 owed on a card at 36% a year, compounded monthly: about 3% a month.
    expect(interestForPeriod(-500_000, card, october)).toBe(-15_292)
    // Daily and monthly compounding of the same nominal rate differ a little.
    const daily: InterestSettings = { ...card, compounding: 'daily' }
    expect(interestForPeriod(-500_000, daily, october)).toBe(-15_516)
  })

  it('WAL-15: offers each fee date up to today once, until it is confirmed or skipped', () => {
    const fee: Fee = {
      id: 'f',
      name: 'Account fee',
      amount: 9_900,
      every: 'month',
      start: '2026-01-31',
    }
    expect(dueFees([fee], '2026-03-15').map((due) => due.date)).toEqual([
      '2026-01-31',
      '2026-02-28',
    ])
    const handled = handleFee(fee, '2026-02-28')
    expect(dueFees([handled], '2026-03-15')).toEqual([])
    expect(nextFeeDate(handled, '2026-03-15')).toBe('2026-03-31')
    const annual: Fee = {
      id: 'a',
      name: 'Annual fee',
      amount: 89_900,
      every: 'year',
      start: '2025-11-01',
      handled: '2025-11-01',
    }
    expect(dueFees([annual], '2026-10-15')).toEqual([])
    expect(nextFeeDate(annual, '2026-10-15')).toBe('2026-11-01')
    expect(dueFees([annual], '2026-11-01').map((due) => due.date)).toEqual(['2026-11-01'])
  })

  it('WAL-16: shows utilization and the next statement and payment dates', () => {
    const credit = { limit: 3_000_000, closingDay: 20, dueDay: 10 }
    // The statement that closed Sep 20 was due Oct 10; by Oct 15 the next one is Nov 10.
    expect(creditSummary(-438_510, credit, '2026-10-15')).toEqual({
      used: 438_510,
      available: 2_561_490,
      utilization: 438_510 / 3_000_000,
      nextClosing: '2026-10-20',
      nextDue: '2026-11-10',
    })
    expect(creditSummary(-438_510, credit, '2026-10-05').nextDue).toBe('2026-10-10')
    expect(creditSummary(25_000, credit, '2026-10-05').used).toBe(0)
  })

  it('WAL-17: projects the payoff date and the interest still to pay', () => {
    const rate: InterestSettings = { rate: 1200, type: 'nominal', compounding: 'monthly' }
    // 200,000.00 over 48 months at 12% a year is 5,266.77 a month.
    const payment = loanPayment(20_000_000, 48, rate)
    expect(payment).toBe(526_677)
    const loan = { principal: 20_000_000, termMonths: 48, payment, paymentDay: 5 }
    const projection = loanProjection(-20_000_000, loan, rate, '2026-10-15')
    expect(projection).toMatchObject({
      kind: 'onTrack',
      paymentsLeft: 48,
      payoffDate: '2030-10-05',
      contractInterest: 526_677 * 48 - 20_000_000,
    })
    if (projection.kind === 'onTrack') expect(projection.interestLeft).toBeCloseTo(5_280_448, -2)
    expect(loanProjection(-20_000_000, { ...loan, payment: 150_000 }, rate, '2026-10-15')).toEqual({
      kind: 'never',
      monthlyInterest: 200_000,
    })
    expect(loanProjection(0, loan, rate, '2026-10-15')).toEqual({ kind: 'paidOff' })
  })

  it('WAL-18: separates what went in from what the market added', () => {
    expect(
      valuationSummary([
        { kind: 'openingBalance', amount: 100_000 },
        { kind: 'valuation', amount: 5_000 },
        { kind: 'adjustment', amount: 20_000 },
        { kind: 'valuation', amount: -2_000 },
      ]),
    ).toEqual({ contributed: 120_000, gain: 3_000, gainShare: 0.025 })
  })
})
