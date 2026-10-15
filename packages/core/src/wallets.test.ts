import { describe, expect, it } from 'vitest'
import type { Transaction } from './transactions.ts'
import {
  applyPreset,
  balanceAdjustment,
  canChangeCurrency,
  reorderedWallets,
  netWorth,
  newWallet,
  openingBalance,
  pickableWallets,
  startingWallet,
  presetDefaults,
  sortWallets,
  toggleFeature,
  type Wallet,
  walletBalance,
  walletBalances,
  type WalletPreset,
  walletTransactions,
} from './wallets.ts'

function wallet(id: string, preset: WalletPreset, extra: Partial<Wallet> = {}): Wallet {
  return { id, ...newWallet(id, 'MXN', preset), ...extra }
}

function transaction(
  id: string,
  walletId: string,
  amount: number,
  date = '2026-10-01',
): Transaction {
  return { id, kind: 'openingBalance', walletId, date, amount }
}

describe('wallets', () => {
  it('WAL-02: a new wallet needs only a name and takes the default currency', () => {
    expect(newWallet('  Cash  ', 'MXN')).toEqual({
      name: 'Cash',
      preset: 'generic',
      currency: 'MXN',
      features: [],
      active: true,
      inNetWorth: true,
      inBudget: true,
    })
  })

  it('WAL-11: each preset switches on only its own features', () => {
    expect(newWallet('a', 'MXN', 'checking').features).toEqual(['fees', 'liquid'])
    expect(newWallet('a', 'MXN', 'savings').features).toEqual(['interest', 'liquid'])
    expect(newWallet('a', 'MXN', 'investment').features).toEqual(['valuations'])
    expect(newWallet('a', 'MXN', 'creditCard').features).toEqual([
      'creditLimit',
      'interest',
      'fees',
    ])
    expect(newWallet('a', 'MXN', 'loan').features).toEqual(['loanSchedule', 'interest'])
    for (const preset of ['cash', 'voucher', 'generic'] as const)
      expect(newWallet('a', 'MXN', preset).features).toEqual([])
  })

  it('WAL-12: any feature switches on or off whatever the preset', () => {
    const cash = newWallet('a', 'MXN', 'cash')
    const withLimit = toggleFeature(cash, 'creditLimit')
    expect(withLimit.features).toEqual(['creditLimit'])
    expect(toggleFeature(withLimit, 'creditLimit').features).toEqual([])
  })

  it('WAL-11, WAL-12: another preset swaps its features but keeps those set by hand', () => {
    const checking = toggleFeature(
      toggleFeature(newWallet('a', 'MXN', 'checking'), 'fees'),
      'valuations',
    )
    // Fees were switched off by hand and valuations on.
    const savings = applyPreset(checking, 'savings')
    expect(savings.features.sort()).toEqual(['interest', 'liquid', 'valuations'])
    expect(presetDefaults.savings.owed).toBe(false)
    expect(presetDefaults.creditCard.owed).toBe(true)
  })

  it('WAL-05, WAL-06: the balance is the sum of every transaction, opening balance included', () => {
    const opening = { id: 'o', ...openingBalance('w', 100000, '2026-01-01') }
    const transactions = [opening, transaction('a', 'w', -2550), transaction('b', 'other', 999)]
    expect(walletBalance('w', transactions)).toBe(97450)
    expect(walletBalances([wallet('w', 'cash'), wallet('empty', 'cash')], transactions)).toEqual(
      new Map([
        ['w', 97450],
        ['empty', 0],
      ]),
    )
  })

  it('WAL-07: an actual balance that differs records the difference as an adjustment', () => {
    expect(balanceAdjustment('w', 97450, 100000, '2026-10-15')).toEqual({
      kind: 'adjustment',
      walletId: 'w',
      date: '2026-10-15',
      amount: 2550,
    })
    expect(balanceAdjustment('w', -500, -1500, '2026-10-15')?.amount).toBe(-1000)
    expect(balanceAdjustment('w', 97450, 97450, '2026-10-15')).toBeNull()
  })

  it('WAL-05: lists a wallet transactions newest first', () => {
    const list = walletTransactions('w', [
      transaction('1', 'w', 1, '2026-01-01'),
      transaction('2', 'w', 1, '2026-03-01'),
      transaction('3', 'x', 1, '2026-02-01'),
      transaction('4', 'w', 1, '2026-03-01'),
    ])
    expect(list.map((item) => item.id)).toEqual(['4', '2', '1'])
  })

  it('WAL-24: new transactions start in the default wallet, else the last one used', () => {
    const cash = wallet('a', 'cash')
    const card = wallet('b', 'creditCard')
    const closed = wallet('c', 'checking', { active: false })
    const all = [cash, card, closed]
    expect(startingWallet(all, 'b', 'a')).toBe(card)
    expect(startingWallet(all, null, 'a')).toBe(cash)
    // An inactive or deleted default doesn't count (WAL-04).
    expect(startingWallet(all, 'c', 'a')).toBe(cash)
    expect(startingWallet(all, 'gone', null)).toBeNull()
  })

  it('WAL-04: inactive wallets are left out of pickers only', () => {
    const active = wallet('a', 'cash')
    const inactive = wallet('b', 'cash', { active: false })
    expect(pickableWallets([active, inactive])).toEqual([active])
    const worth = netWorth(
      [active, inactive],
      new Map([
        ['a', 100],
        ['b', 200],
      ]),
      'MXN',
    )
    expect(worth.netWorth).toBe(300)
  })

  it('WAL-20: net worth sums every balance and net debt the negative ones', () => {
    // The spec's acceptance example, in whole pesos.
    const balances: [string, WalletPreset, number][] = [
      ['Savings', 'savings', 100126],
      ['Cash', 'cash', 3270],
      ['Vouchers', 'voucher', 2125],
      ['Card 1', 'creditCard', -26836],
      ['Card 2', 'creditCard', -21829],
      ['Card 3', 'creditCard', -3555],
    ]
    const wallets = balances.map(([name, preset]) => wallet(name, preset))
    const worth = netWorth(
      wallets,
      new Map(balances.map(([name, , amount]) => [name, amount * 100])),
      'MXN',
    )
    expect(worth.netWorth).toBe(5330100)
    expect(worth.owe).toBe(5222000)
    expect(worth.have).toBe(10552100)
    expect(worth.counted).toBe(6)
  })

  it('WAL-21: spreads what I have and what I owe by wallet and by preset', () => {
    const wallets = [
      wallet('a', 'savings'),
      wallet('b', 'savings'),
      wallet('c', 'cash'),
      wallet('d', 'creditCard'),
      wallet('e', 'loan'),
    ]
    const worth = netWorth(
      wallets,
      new Map([
        ['a', 500],
        ['b', 250],
        ['c', 250],
        ['d', -100],
        ['e', -300],
      ]),
      'MXN',
    )
    expect(worth.haveSpread.byWallet.map((share) => [share.wallet.id, share.share])).toEqual([
      ['a', 0.5],
      ['b', 0.25],
      ['c', 0.25],
    ])
    expect(worth.haveSpread.byPreset).toEqual([
      { preset: 'savings', total: 750, wallets: 2, share: 0.75 },
      { preset: 'cash', total: 250, wallets: 1, share: 0.25 },
    ])
    expect(worth.oweSpread.byWallet.map((share) => [share.wallet.id, share.balance])).toEqual([
      ['e', 300],
      ['d', 100],
    ])
  })

  it('WAL-22: liquid money counts only positive balances of liquid wallets', () => {
    const worth = netWorth(
      [wallet('a', 'checking'), wallet('b', 'investment'), wallet('c', 'savings')],
      new Map([
        ['a', 1000],
        ['b', 5000],
        ['c', -10],
      ]),
      'MXN',
    )
    expect(worth.liquid).toBe(1000)
  })

  it('WAL-09: a wallet left out of net worth is not counted', () => {
    const worth = netWorth(
      [wallet('a', 'cash'), wallet('b', 'cash', { inNetWorth: false })],
      new Map([
        ['a', 100],
        ['b', 900],
      ]),
      'MXN',
    )
    expect([worth.netWorth, worth.counted, worth.otherCurrency]).toEqual([100, 1, []])
  })

  it('WAL-20: wallets in another currency are listed apart until exchange rates exist', () => {
    const dollars = wallet('b', 'savings', { currency: 'USD' })
    const worth = netWorth(
      [wallet('a', 'cash'), dollars],
      new Map([
        ['a', 100],
        ['b', 900],
      ]),
      'MXN',
    )
    expect([worth.netWorth, worth.otherCurrency]).toEqual([100, [dollars]])
  })

  it('WAL-02: a wallet with transactions changes only to a currency with the same decimals', () => {
    expect(canChangeCurrency('MXN', 'USD', 5)).toBe(true)
    expect(canChangeCurrency('MXN', 'JPY', 5)).toBe(false)
    expect(canChangeCurrency('MXN', 'JPY', 0)).toBe(true)
  })

  it('WAL-10: keeps the order the person set, and saves only the wallets that moved', () => {
    const a = wallet('a', 'cash')
    const b = wallet('b', 'savings')
    const c = wallet('c', 'checking', { order: 0 })
    const ordered = sortWallets([a, b, c])
    expect(ordered.map((w) => w.id)).toEqual(['c', 'a', 'b'])
    // Moving the last wallet to the top saves every wallet whose place changed.
    const moved = reorderedWallets([b, c, a])
    expect(moved.map((w) => [w.id, w.order])).toEqual([
      ['b', 0],
      ['c', 1],
      ['a', 2],
    ])
    expect(reorderedWallets(moved)).toEqual([])
  })

  it('SYS-04: other-currency wallets count in net worth at the rate in use', () => {
    const dollars = wallet('b', 'savings', { currency: 'USD', features: ['liquid'] })
    const rates = [{ id: 'r', from: 'USD', to: 'MXN', rate: 18_450_000, date: '2026-10-01' }]
    const balances = new Map([
      ['a', 100_000],
      ['b', 10_000],
    ])
    const worth = netWorth([wallet('a', 'cash'), dollars], balances, 'MXN', rates, '2026-10-15')
    // 100.00 USD at 18.45 is 1,845.00 MXN.
    expect([worth.netWorth, worth.liquid, worth.otherCurrency]).toEqual([284_500, 184_500, []])
    expect(worth.ratesUsed.get('USD')?.rate.id).toBe('r')
    // A rate dated after today is not in use yet.
    const early = netWorth([dollars], balances, 'MXN', rates, '2026-09-30')
    expect(early.otherCurrency).toEqual([dollars])
  })
})
