import { fractionDigits } from './money.ts'

// Epic 1: wallets, their balances, net worth and net debt. Pure functions over the
// decrypted records; the caller passes everything in, "today" included. The types
// mirror the record schemas in @repo/api, which apps/web checks stay in step.

/** WAL-11: a preset only decides which optional features start switched on. */
export type WalletPreset =
  'cash' | 'checking' | 'savings' | 'investment' | 'creditCard' | 'loan' | 'voucher' | 'generic'

/** WAL-12: the optional features any wallet can switch on or off. */
export type WalletFeature =
  'interest' | 'fees' | 'creditLimit' | 'loanSchedule' | 'valuations' | 'liquid'

export interface WalletFields {
  name: string
  preset: WalletPreset
  currency: string
  features: WalletFeature[]
  active: boolean
  inNetWorth: boolean
  inBudget: boolean
}

export interface Wallet extends WalletFields {
  id: string
}

export type TransactionKind = 'openingBalance' | 'adjustment'

export interface TransactionFields {
  kind: TransactionKind
  walletId: string
  date: string
  /** Minor units in the wallet's currency; negative takes from the balance. */
  amount: number
  note?: string
}

export interface Transaction extends TransactionFields {
  id: string
}

interface PresetDefaults {
  features: readonly WalletFeature[]
  /** Whether its balance is usually money owed, so a form starts on "I owe". */
  owed: boolean
}

/** WAL-11: what each preset switches on. */
export const presetDefaults: Record<WalletPreset, PresetDefaults> = {
  cash: { features: [], owed: false },
  checking: { features: ['fees', 'liquid'], owed: false },
  savings: { features: ['interest', 'liquid'], owed: false },
  investment: { features: ['valuations'], owed: false },
  creditCard: { features: ['creditLimit', 'interest', 'fees'], owed: true },
  loan: { features: ['loanSchedule', 'interest'], owed: true },
  voucher: { features: [], owed: false },
  generic: { features: [], owed: false },
}

/** WAL-02: a new wallet needs only a name; everything else has a default. */
export function newWallet(
  name: string,
  defaultCurrency: string,
  preset: WalletPreset = 'generic',
): WalletFields {
  return {
    name: name.trim(),
    preset,
    currency: defaultCurrency,
    features: [...presetDefaults[preset].features],
    active: true,
    inNetWorth: true,
    inBudget: true,
  }
}

/**
 * WAL-11, WAL-12: picking another preset switches its features on and the old preset's
 * off. Features the person switched by hand stay as they set them.
 */
export function applyPreset<W extends WalletFields>(wallet: W, preset: WalletPreset): W {
  const before = presetDefaults[wallet.preset]
  const after = presetDefaults[preset]
  const byHandOn = wallet.features.filter((feature) => !before.features.includes(feature))
  const byHandOff = before.features.filter((feature) => !wallet.features.includes(feature))
  const features = [...new Set([...after.features, ...byHandOn])].filter(
    (feature) => !byHandOff.includes(feature) || after.features.includes(feature),
  )
  return { ...wallet, preset, features }
}

/** WAL-12: switches one optional feature on or off. */
export function toggleFeature<W extends WalletFields>(wallet: W, feature: WalletFeature): W {
  return {
    ...wallet,
    features: wallet.features.includes(feature)
      ? wallet.features.filter((on) => on !== feature)
      : [...wallet.features, feature],
  }
}

/** WAL-06: a wallet's balance is the sum of all its transactions, opening balance included. */
export function walletBalance(walletId: string, transactions: readonly Transaction[]): number {
  let balance = 0
  for (const transaction of transactions) {
    if (transaction.walletId === walletId) balance += transaction.amount
  }
  return balance
}

/** Every wallet's balance (WAL-06), by wallet id. */
export function walletBalances(
  wallets: readonly Wallet[],
  transactions: readonly Transaction[],
): Map<string, number> {
  const balances = new Map(wallets.map((wallet) => [wallet.id, 0]))
  for (const transaction of transactions) {
    const balance = balances.get(transaction.walletId)
    if (balance !== undefined) balances.set(transaction.walletId, balance + transaction.amount)
  }
  return balances
}

/** A wallet's transactions, newest first; on the same date, the last one made first. */
export function walletTransactions(
  walletId: string,
  transactions: readonly Transaction[],
): Transaction[] {
  return transactions
    .filter((transaction) => transaction.walletId === walletId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
}

/** WAL-05: the opening balance, as an ordinary transaction dated `today`. */
export function openingBalance(walletId: string, amount: number, today: string): TransactionFields {
  return { kind: 'openingBalance', walletId, date: today, amount }
}

/**
 * WAL-07: the adjustment that brings the computed balance to the actual one, or null
 * when they already match.
 */
export function balanceAdjustment(
  walletId: string,
  computed: number,
  actual: number,
  today: string,
): TransactionFields | null {
  if (computed === actual) return null
  return { kind: 'adjustment', walletId, date: today, amount: actual - computed }
}

/** WAL-04: the wallets a picker offers. Inactive ones stay everywhere else. */
export function pickableWallets<W extends Pick<Wallet, 'active'>>(wallets: readonly W[]): W[] {
  return wallets.filter((wallet) => wallet.active)
}

/**
 * WAL-02: a wallet with transactions can move to a currency with the same number of
 * decimals (MXN to USD), since its amounts read the same; not to one with a different
 * number (MXN to JPY), which would change every amount.
 */
export function canChangeCurrency(from: string, to: string, transactionCount: number): boolean {
  return transactionCount === 0 || fractionDigits(from) === fractionDigits(to)
}

export interface WalletShare<W extends Wallet = Wallet> {
  wallet: W
  balance: number
  /** Its part of what I have, or of what I owe, from 0 to 1. */
  share: number
}

export interface PresetShare {
  preset: WalletPreset
  total: number
  wallets: number
  share: number
}

export interface Spread<W extends Wallet = Wallet> {
  /** WAL-21: largest first. */
  byWallet: WalletShare<W>[]
  byPreset: PresetShare[]
}

export interface NetWorth<W extends Wallet = Wallet> {
  currency: string
  /** WAL-20: the sum of every counted balance. */
  netWorth: number
  /** What I have: the sum of the positive balances. */
  have: number
  /** What I owe (net debt): the sum of the negative balances, as a positive amount. */
  owe: number
  /** WAL-22: money available now, the positive balances of liquid wallets. */
  liquid: number
  /** WAL-21: how what I have and what I owe are spread. Amounts are positive. */
  haveSpread: Spread<W>
  oweSpread: Spread<W>
  /** How many wallets the totals count. */
  counted: number
  /**
   * Wallets in another currency, left out until SYS-04 exchange rates arrive.
   * Wallets the person left out (WAL-09) are not listed here.
   */
  otherCurrency: W[]
}

/**
 * WAL-20, WAL-21, WAL-22: net worth, net debt and their spread, in the default currency.
 * Inactive wallets still count (WAL-04); wallets left out of net worth don't (WAL-09).
 */
export function netWorth<W extends Wallet>(
  wallets: readonly W[],
  balances: ReadonlyMap<string, number>,
  currency: string,
): NetWorth<W> {
  const otherCurrency: W[] = []
  const have: WalletShare<W>[] = []
  const owe: WalletShare<W>[] = []
  let liquid = 0
  for (const wallet of wallets) {
    if (!wallet.inNetWorth) continue
    if (wallet.currency !== currency) {
      otherCurrency.push(wallet)
      continue
    }
    const balance = balances.get(wallet.id) ?? 0
    if (balance < 0) owe.push({ wallet, balance: -balance, share: 0 })
    else have.push({ wallet, balance, share: 0 })
    if (balance > 0 && wallet.features.includes('liquid')) liquid += balance
  }
  const haveSpread = spread(have)
  const oweSpread = spread(owe)
  const haveTotal = sum(have)
  const oweTotal = sum(owe)
  return {
    currency,
    netWorth: haveTotal - oweTotal,
    have: haveTotal,
    owe: oweTotal,
    liquid,
    haveSpread,
    oweSpread,
    counted: have.length + owe.length,
    otherCurrency,
  }
}

function sum(shares: readonly WalletShare[]) {
  return shares.reduce((total, share) => total + share.balance, 0)
}

function spread<W extends Wallet>(shares: WalletShare<W>[]): Spread<W> {
  const total = sum(shares)
  const ratio = (amount: number) => (total === 0 ? 0 : amount / total)
  const byPreset = new Map<WalletPreset, PresetShare>()
  for (const share of shares) {
    share.share = ratio(share.balance)
    const preset = byPreset.get(share.wallet.preset) ?? {
      preset: share.wallet.preset,
      total: 0,
      wallets: 0,
      share: 0,
    }
    preset.total += share.balance
    preset.wallets += 1
    byPreset.set(share.wallet.preset, preset)
  }
  for (const preset of byPreset.values()) preset.share = ratio(preset.total)
  return {
    byWallet: shares.sort((a, b) => b.balance - a.balance),
    byPreset: [...byPreset.values()].sort((a, b) => b.total - a.total),
  }
}
