import { describe, expect, it } from 'vitest'
import type { PlanLine } from './budget.ts'
import {
  attention,
  type AttentionInput,
  balancesToCheck,
  cardsDue,
  comingTotals,
  comingUp,
  lastChecked,
  monthGlance,
} from './home.ts'
import type { Recurring } from './recurring.ts'
import type { Transaction } from './transactions.ts'
import { newWallet, type Wallet, type WalletPreset } from './wallets.ts'

const today = '2026-10-20'
const october = { start: '2026-10-01', end: '2026-10-31' }
const credit = { limit: 5_000_000, closingDay: 5, dueDay: 25 }

function wallet(id: string, preset: WalletPreset, extra: Partial<Wallet> = {}): Wallet {
  return { id, ...newWallet(id, 'MXN', preset), ...extra }
}

const card = wallet('card', 'creditCard', {
  credit,
  fees: [
    {
      id: 'annual',
      name: 'Annual fee',
      amount: 120_000,
      every: 'year',
      start: '2025-10-31',
      handled: '2025-10-31',
    },
  ],
})
const checking = wallet('checking', 'checking', {
  fees: [
    {
      id: 'monthly',
      name: 'Account fee',
      amount: 9_900,
      every: 'month',
      start: '2026-09-15',
      handled: '2026-09-15',
    },
  ],
})

function transaction(
  id: string,
  walletId: string,
  date: string,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction {
  return { id, kind: 'expense', walletId, date, amount, ...extra }
}

// The card's September statement closed on Oct 5 with $8,420 on it, due Oct 25.
const history: Transaction[] = [
  transaction('opening', 'checking', '2026-09-01', 5_000_000, { kind: 'openingBalance' }),
  transaction('flight', 'card', '2026-09-30', -842_000),
  transaction('laptop', 'checking', '2026-07-28', -2_499_900, { installments: { months: 12 } }),
]
const paid = transaction('pay', 'checking', '2026-10-21', -842_000, {
  kind: 'transfer',
  toWalletId: 'card',
  toAmount: 842_000,
})

function recurring(id: string, patch: Partial<Recurring> = {}): Recurring {
  return {
    id,
    kind: 'expense',
    walletId: 'checking',
    amount: -12_900,
    start: '2026-01-23',
    every: { unit: 'month', count: 1 },
    ...patch,
  }
}

function line(key: string, patch: Partial<PlanLine> = {}): PlanLine {
  return {
    key,
    categoryId: key,
    tagId: null,
    flexibility: 'flexible',
    groupId: 'group',
    base: 100_000,
    target: 100_000,
    starting: 100_000,
    carry: 0,
    spent: 50_000,
    left: 50_000,
    projected: 90_000,
    status: 'onTrack',
    lastDate: null,
    usual: null,
    ...patch,
  }
}

describe('home', () => {
  it('DSH-01: says what is left, a day at a time, and how the month should finish', () => {
    const glance = monthGlance(
      { period: october, target: 2_200_000, spent: 1_356_349, left: 843_651, projected: 1_976_000 },
      today,
    )
    // Oct 20 to Oct 31, today included.
    expect(glance.daysLeft).toBe(12)
    expect(glance.perDay).toBe(70_304)
    expect(glance.finish).toBe(224_000)
    expect(glance.spentShare).toBeCloseTo(0.6165, 4)
    expect(glance.todayShare).toBeCloseTo(20 / 31, 6)
  })

  it('DSH-01: has no amount a day once the month is over budget', () => {
    const glance = monthGlance(
      { period: october, target: 100_000, spent: 120_000, left: -20_000, projected: 150_000 },
      today,
    )
    expect(glance.perDay).toBeNull()
    expect(glance.finish).toBe(-50_000)
  })

  it('DSH-05: lists a card payment due in the next 7 days until it is paid', () => {
    expect(cardsDue([card, checking], history, today)).toEqual([
      { walletId: 'card', amount: 842_000, due: '2026-10-25' },
    ])
    // Still due once the date passed, until it is paid.
    expect(cardsDue([card], history, '2026-10-27')).toHaveLength(1)
    expect(cardsDue([card], [...history, paid], '2026-10-22')).toEqual([])
    // Too far off yet.
    expect(cardsDue([card], history, '2026-10-12')).toEqual([])
  })

  it('DSH-05: counts the last check, even one that matched, or the last balance typed', () => {
    const typed = [
      transaction('opening', 'cash', '2026-06-01', 50_000, { kind: 'openingBalance' }),
      transaction('fix', 'cash', '2026-08-10', -1_000, { kind: 'adjustment' }),
      transaction('lunch', 'cash', '2026-10-01', -15_000),
    ]
    expect(lastChecked({ id: 'cash' }, typed)).toBe('2026-08-10')
    expect(lastChecked({ id: 'cash', checkedOn: '2026-09-30' }, typed)).toBe('2026-09-30')
    expect(lastChecked({ id: 'other' }, typed)).toBeNull()
  })

  it('DSH-05: asks to check balances not checked in over 30 days, longest first', () => {
    const typed = [
      transaction('a', 'cash', '2026-09-19', 0, { kind: 'adjustment' }),
      transaction('b', 'savings', '2026-09-20', 0, { kind: 'openingBalance' }),
      transaction('c', 'old', '2026-01-01', 0, { kind: 'openingBalance' }),
      transaction('d', 'gone', '2026-01-01', 0, { kind: 'openingBalance' }),
    ]
    const wallets = [
      wallet('cash', 'cash'),
      wallet('savings', 'savings'),
      wallet('old', 'savings'),
      wallet('gone', 'savings', { active: false }),
      wallet('new', 'cash'),
    ]
    expect(balancesToCheck(wallets, typed, today)).toEqual([
      { walletId: 'old', since: '2026-01-01' },
      { walletId: 'cash', since: '2026-09-19' },
    ])
  })

  it('DSH-05, BUD-45: lists what needs the person, most urgent first', () => {
    const input: AttentionInput = {
      today,
      wallets: [card, checking],
      transactions: history,
      recurrings: [recurring('rent', { ask: true, start: '2026-10-15', amount: -1_200_000 })],
      month: {
        period: october,
        lines: [
          line('food', { status: 'atRisk', projected: 148_000 }),
          line('fun', { status: 'over', spent: 130_000, left: -30_000 }),
          line('rent', { flexibility: 'locked', status: 'over', left: -5_000 }),
          line('car'),
        ],
      },
      review: { start: '2026-09-01', end: '2026-09-30' },
      budget: null,
      next: { start: '2026-11-01', days: 12 },
      uncategorized: 7,
      waiting: 2,
    }
    const items = attention(input)
    expect(items.map((item) => item.kind)).toEqual([
      'card',
      'over',
      'atRisk',
      'confirm',
      'fee',
      'review',
      'categorize',
      'imports',
      'nextBudget',
      'balance',
    ])
    // A Commitment lands on its date, so it never shows as over (BUD-43).
    expect(items[1]).toEqual({ kind: 'over', line: 'fun', amount: 30_000, end: '2026-10-31' })
    // BUD-45: the projected overrun by the month's end.
    expect(items[2]).toEqual({ kind: 'atRisk', line: 'food', amount: 48_000, end: '2026-10-31' })
    expect(items[3]).toMatchObject({ kind: 'confirm', items: [{ date: '2026-10-15' }] })
    expect(items[4]).toMatchObject({ kind: 'fee', walletId: 'checking', date: '2026-10-15' })
    expect(items[9]).toEqual({
      kind: 'balance',
      checks: [{ walletId: 'checking', since: '2026-09-01' }],
    })
  })

  it('DSH-05: asks for a budget for a month without one, and nothing about lines', () => {
    const items = attention({
      today,
      wallets: [],
      transactions: [],
      recurrings: [],
      month: null,
      review: null,
      budget: '2026-10-01',
      next: null,
      uncategorized: 0,
      waiting: 0,
    })
    expect(items).toEqual([{ kind: 'budget', start: '2026-10-01' }])
  })

  it('DSH-11: lists what comes on its own in the next two weeks, soonest first', () => {
    const spotify = recurring('spotify', { walletId: 'card' })
    const salary = recurring('salary', { kind: 'income', amount: 1_850_000, start: '2026-01-25' })
    const save = recurring('save', {
      kind: 'transfer',
      start: '2026-01-26',
      toWalletId: 'card',
      toAmount: 50_000,
      amount: -50_000,
    })
    const rent = recurring('rent', { ask: true, start: '2026-10-15', amount: -1_200_000 })
    const items = comingUp({
      today: '2026-10-12',
      wallets: [card, checking],
      transactions: history,
      recurrings: [spotify, salary, save, rent],
    })
    expect(items.map((item) => [item.date, item.kind])).toEqual([
      ['2026-10-15', 'recurring'],
      ['2026-10-15', 'fee'],
      ['2026-10-23', 'recurring'],
      ['2026-10-25', 'card'],
      ['2026-10-25', 'recurring'],
      ['2026-10-26', 'recurring'],
    ])
    // One that asks first shows here until it comes due, then needs attention.
    expect(items[0]).toMatchObject({ recurring: { id: 'rent' } })
    const later = comingUp({
      today,
      wallets: [card, checking],
      transactions: history,
      recurrings: [spotify],
    })
    // The card is due within 7 days, so it needs attention instead (DSH-05).
    expect(later.map((item) => [item.date, item.kind])).toEqual([
      ['2026-10-23', 'recurring'],
      ['2026-10-28', 'installment'],
      ['2026-10-31', 'fee'],
    ])
    expect(later[1]).toMatchObject({ part: { part: { number: 4, of: 12 } } })
  })

  it('DSH-11: totals what goes out and comes in, leaving transfers out', () => {
    const items = comingUp({
      today: '2026-10-12',
      wallets: [card, checking],
      transactions: history,
      recurrings: [
        recurring('spotify', { walletId: 'card' }),
        recurring('salary', { kind: 'income', amount: 1_850_000, start: '2026-01-25' }),
        recurring('save', {
          kind: 'transfer',
          start: '2026-01-26',
          toWalletId: 'card',
          toAmount: 50_000,
          amount: -50_000,
        }),
      ],
    })
    const context = {
      walletCurrency: new Map([
        ['card', 'MXN'],
        ['checking', 'MXN'],
      ]),
      currency: 'MXN',
      rates: [],
    }
    // The $99 account fee and Spotify; the card payment and the transfer move money only.
    expect(comingTotals(items, context)).toEqual({ out: 22_800, in: 1_850_000 })
  })
})
