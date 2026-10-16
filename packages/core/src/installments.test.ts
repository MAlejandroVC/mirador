import { describe, expect, it } from 'vitest'
import {
  activePlans,
  billingDates,
  cardStatement,
  installmentShares,
  spreadInstallments,
} from './installments.ts'
import type { Transaction } from './transactions.ts'
import { flowTotals } from './transactions.ts'
import { walletBalance } from './wallets.ts'

const credit = { limit: 5_000_000, closingDay: 5, dueDay: 25 }
const today = '2026-10-16'

function expense(
  id: string,
  date: string,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction {
  return { id, kind: 'expense', walletId: 'card', date, amount: -amount, ...extra }
}
function payment(id: string, date: string, amount: number): Transaction {
  return {
    id,
    kind: 'transfer',
    walletId: 'checking',
    date,
    amount: -amount,
    toWalletId: 'card',
    toAmount: amount,
  }
}

// A laptop in 12 interest-free installments in July, two payments, groceries on the
// October statement, a coffee since, and a TV in 6 installments two days ago.
const laptop = expense('laptop', '2026-07-10', 2_400_000, { installments: { months: 12 } })
const tv = expense('tv', '2026-10-14', 900_000, { installments: { months: 6 } })
const history: Transaction[] = [
  laptop,
  payment('p1', '2026-08-25', 200_000),
  payment('p2', '2026-09-25', 200_000),
  expense('groceries', '2026-09-20', 300_000),
  expense('coffee', '2026-10-10', 128_000),
  tv,
]

describe('installments', () => {
  it('TXN-30: splits a purchase into equal installments, the last one taking the rounding', () => {
    expect(installmentShares(-100_000, 3)).toEqual([-33_333, -33_333, -33_334])
    expect(installmentShares(900_000, 6)).toEqual(Array.from({ length: 6 }, () => 150_000))
  })

  it('TXN-32: takes the whole purchase off the balance and available credit at once', () => {
    expect(walletBalance('card', history)).toBe(-3_328_000)
    expect(cardStatement('card', history, credit, today).available).toBe(1_672_000)
  })

  it('TXN-32: counts a purchase in spending one installment a month', () => {
    const entries = spreadInstallments([tv])
    expect(entries.map((entry) => [entry.date, entry.amount, entry.part?.number])).toEqual([
      ['2026-10-14', -150_000, 1],
      ['2026-11-14', -150_000, 2],
      ['2026-12-14', -150_000, 3],
      ['2027-01-14', -150_000, 4],
      ['2027-02-14', -150_000, 5],
      ['2027-03-14', -150_000, 6],
    ])
    expect(entries[0]?.part).toEqual({ number: 1, last: 1, of: 6, purchaseId: 'tv' })
    const october = entries.filter((entry) => entry.date.startsWith('2026-10'))
    const card = new Map([['card', 'MXN']])
    expect(flowTotals(october, card, 'MXN', []).expenses).toBe(150_000)
  })

  it('TXN-30: a deferred plan starts that many months later', () => {
    const deferred = expense('sofa', '2026-10-14', 300_000, {
      installments: { months: 3, deferred: 2 },
    })
    expect(spreadInstallments([deferred]).map((entry) => entry.date)).toEqual([
      '2026-12-14',
      '2027-01-14',
      '2027-02-14',
    ])
    expect(billingDates(deferred, 5)).toEqual(['2027-01-05', '2027-02-05', '2027-03-05'])
  })

  it('TXN-33: paying off early puts everything left on that date', () => {
    const paidOff = { ...tv, installments: { months: 6, paidOff: '2026-12-01' } }
    expect(
      spreadInstallments([paidOff]).map((entry) => [entry.date, entry.amount, entry.part?.last]),
    ).toEqual([
      ['2026-10-14', -150_000, 1],
      ['2026-11-14', -150_000, 2],
      ['2026-12-01', -600_000, 6],
    ])
  })

  it('WAL-25: bills each installment on the statement after the purchase, one a month', () => {
    expect(billingDates(tv, 5)).toEqual([
      '2026-11-05',
      '2026-12-05',
      '2027-01-05',
      '2027-02-05',
      '2027-03-05',
      '2027-04-05',
    ])
    // Bought on the closing day, it goes on that day's statement; day 31 clamps.
    expect(
      billingDates(expense('x', '2026-10-05', 200, { installments: { months: 2 } }), 5),
    ).toEqual(['2026-10-05', '2026-11-05'])
    expect(
      billingDates(expense('y', '2027-01-31', 200, { installments: { months: 2 } }), 31),
    ).toEqual(['2027-01-31', '2027-02-28'])
  })

  it('WAL-25: splits what the card owes into the statement, the charges since and what is to come', () => {
    expect(cardStatement('card', history, credit, today)).toEqual({
      owed: 3_328_000,
      // The laptop's third installment and the groceries.
      statement: 500_000,
      since: 128_000,
      // Nine laptop installments and the whole TV.
      unbilled: 2_700_000,
      available: 1_672_000,
      lastClosing: '2026-10-05',
      due: '2026-10-25',
      nextClosing: '2026-11-05',
    })
    // A payment since the statement comes off what is left to pay.
    const paid = cardStatement(
      'card',
      [...history, payment('p3', '2026-10-12', 200_000)],
      credit,
      today,
    )
    expect([paid.statement, paid.since]).toEqual([300_000, 128_000])
  })

  it('TXN-33: a plan paid off early is billed that day, and its payment leaves the statement alone', () => {
    const paidOff = [
      ...history.filter((transaction) => transaction.id !== 'tv'),
      { ...tv, installments: { months: 6, paidOff: '2026-10-15' } },
      payment('p3', '2026-10-15', 900_000),
    ]
    const statement = cardStatement('card', paidOff, credit, today)
    expect([statement.statement, statement.since, statement.unbilled]).toEqual([
      500_000, 128_000, 1_800_000,
    ])
  })

  it('WAL-25: lists the plans still being billed, with how far along each one is', () => {
    const plans = activePlans('card', history, 5, today)
    expect(
      plans.map((plan) => [plan.purchase.id, plan.billed, plan.months, plan.monthly, plan.left]),
    ).toEqual([
      ['tv', 0, 6, 150_000, 900_000],
      ['laptop', 3, 12, 200_000, 1_800_000],
    ])
  })

  it('TXN-31: a plan with interest charges the total and knows its interest', () => {
    const withInterest = expense('phone', '2026-10-01', 1_200_000, {
      installments: { months: 12, price: 1_000_000 },
    })
    const [plan] = activePlans('card', [withInterest], 5, today)
    expect([plan?.monthly, plan?.interest]).toEqual([100_000, 200_000])
  })
})
