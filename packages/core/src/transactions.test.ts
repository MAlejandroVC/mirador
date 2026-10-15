import { describe, expect, it } from 'vitest'
import { applyRate, rateBetween } from './exchange.ts'
import {
  byDay,
  changeTo,
  entryDraft,
  entryFields,
  flow,
  lastUsedWallet,
  spent,
  type Transaction,
} from './transactions.ts'
import { netWorth, walletBalance, walletBalances, walletTransactions } from './wallets.ts'

const now = '2026-10-15T12:00:00.000Z'

function entry(id: string, fields: Omit<Transaction, 'id'>): Transaction {
  return { id, ...fields }
}

describe('transactions', () => {
  it('TXN-01: the type sets the direction of an amount entered positive', () => {
    const expense = entryFields(
      { type: 'expense', amount: 4500, walletId: 'cash', date: '2026-10-15' },
      'manual',
      now,
    )
    const income = entryFields(
      { type: 'income', amount: 120_000, walletId: 'cash', date: '2026-10-15', note: ' Pay ' },
      'quickAdd',
      now,
    )
    expect(expense).toMatchObject({ kind: 'expense', amount: -4500, source: 'manual' })
    expect(income).toMatchObject({ kind: 'income', amount: 120_000, note: 'Pay' })
    expect(entryDraft({ ...expense, kind: 'expense' })).toMatchObject({ amount: 4500 })
  })

  it('TXN-03: a transfer takes from one wallet and adds the same to the other', () => {
    const transfer = entry(
      '01',
      entryFields(
        {
          type: 'transfer',
          amount: 50_000,
          walletId: 'checking',
          toWalletId: 'savings',
          date: '2026-10-15',
        },
        'manual',
        now,
      ),
    )
    expect(changeTo(transfer, 'checking')).toBe(-50_000)
    expect(changeTo(transfer, 'savings')).toBe(50_000)
    expect(changeTo(transfer, 'cash')).toBe(0)
    expect(walletBalance('savings', [transfer])).toBe(50_000)
    expect(flow(transfer)).toBeNull()
    expect(walletTransactions('savings', [transfer])).toEqual([transfer])
  })

  it('TXN-04: paying a credit card lowers what is owed and is not spending', () => {
    const wallets = [
      { id: 'checking', currency: 'MXN', features: [], inNetWorth: true },
      { id: 'card', currency: 'MXN', features: [], inNetWorth: true },
    ].map((wallet) => ({
      ...wallet,
      name: wallet.id,
      preset: 'generic' as const,
      active: true,
      inBudget: true,
      features: [],
    }))
    const transactions = [
      entry('01', {
        kind: 'openingBalance',
        walletId: 'checking',
        date: '2026-10-01',
        amount: 100_000,
      }),
      entry('02', {
        kind: 'openingBalance',
        walletId: 'card',
        date: '2026-10-01',
        amount: -30_000,
      }),
      entry('03', {
        kind: 'transfer',
        walletId: 'checking',
        toWalletId: 'card',
        toAmount: 20_000,
        date: '2026-10-10',
        amount: -20_000,
      }),
    ]
    const balances = walletBalances(wallets, transactions)
    expect(balances.get('card')).toBe(-10_000)
    expect(balances.get('checking')).toBe(80_000)
    expect(netWorth(wallets, balances, 'MXN')).toMatchObject({ netWorth: 70_000, owe: 10_000 })
    expect(
      spent(
        transactions,
        new Map([
          ['checking', 'MXN'],
          ['card', 'MXN'],
        ]),
        'MXN',
        [],
      ),
    ).toBe(0)
  })

  it('TXN-05: between currencies, the rate follows from both amounts and back', () => {
    // 100.00 USD became 1,845.00 MXN: 18.45.
    const rate = rateBetween(10_000, 'USD', 184_500, 'MXN')
    expect(rate).toBe(18_450_000)
    expect(applyRate(10_000, 'USD', 'MXN', 18_450_000)).toBe(184_500)
    expect(rateBetween(0, 'USD', 100, 'MXN')).toBeNull()
    // JPY has no cents: 1,000 JPY at 0.125 MXN is 125.00 MXN.
    expect(applyRate(1000, 'JPY', 'MXN', 125_000)).toBe(12_500)
  })

  it('TXN-11: a refund is income, and fees and charged interest are spending', () => {
    expect(flow({ kind: 'income', walletId: 'a', date: '2026-10-01', amount: 10 })).toBe('income')
    expect(flow({ kind: 'fee', walletId: 'a', date: '2026-10-01', amount: -10 })).toBe('expense')
    expect(flow({ kind: 'interest', walletId: 'a', date: '2026-10-01', amount: -10 })).toBe(
      'expense',
    )
    expect(flow({ kind: 'interest', walletId: 'a', date: '2026-10-01', amount: 10 })).toBe('income')
    expect(flow({ kind: 'adjustment', walletId: 'a', date: '2026-10-01', amount: -10 })).toBeNull()
  })

  it('TXN-28: a day groups its transactions and totals what was spent, in one currency', () => {
    const transactions = [
      entry('03', { kind: 'expense', walletId: 'usd', date: '2026-10-15', amount: -1000 }),
      entry('02', { kind: 'expense', walletId: 'cash', date: '2026-10-15', amount: -4500 }),
      entry('01', { kind: 'income', walletId: 'cash', date: '2026-10-14', amount: 9000 }),
    ]
    const days = byDay(transactions)
    expect(days.map((day) => [day.date, day.transactions.length])).toEqual([
      ['2026-10-15', 2],
      ['2026-10-14', 1],
    ])
    const currencies = new Map([
      ['cash', 'MXN'],
      ['usd', 'USD'],
    ])
    // Without a USD rate, the dollars are left out.
    expect(spent(days[0]?.transactions ?? [], currencies, 'MXN', [])).toBe(4500)
    const rates = [{ id: 'r', from: 'USD', to: 'MXN', rate: 18_000_000, date: '2026-10-01' }]
    expect(spent(days[0]?.transactions ?? [], currencies, 'MXN', rates)).toBe(4500 + 18_000)
  })

  it('WID-03: new transactions start in the wallet used last', () => {
    expect(lastUsedWallet([])).toBeNull()
    expect(
      lastUsedWallet([
        entry('02', { kind: 'expense', walletId: 'card', date: '2026-10-01', amount: -1 }),
        entry('03', { kind: 'openingBalance', walletId: 'cash', date: '2026-10-01', amount: 1 }),
        entry('01', { kind: 'expense', walletId: 'checking', date: '2026-10-09', amount: -1 }),
      ]),
    ).toBe('card')
  })
})
