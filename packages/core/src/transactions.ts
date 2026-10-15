import { convert, type ExchangeRate, rateInUse } from './exchange.ts'

// Epic 2: transactions. Pure functions over the decrypted records; the caller passes
// everything in. The types mirror the record schema in @repo/api, which apps/web
// checks stay in step.

/**
 * The kinds the wallets epic makes: the opening balance (WAL-05), adjustments (WAL-07),
 * posted interest (WAL-14), confirmed fees (WAL-15) and market-value updates (WAL-18).
 * Then the three a person records (TXN-01).
 */
export type TransactionKind =
  | 'openingBalance'
  | 'adjustment'
  | 'interest'
  | 'fee'
  | 'valuation'
  | 'expense'
  | 'income'
  | 'transfer'

/** TXN-01: what a person records: an expense, an income or a transfer. */
export type EntryType = 'expense' | 'income' | 'transfer'

export type TransactionSource = 'manual' | 'quickAdd' | 'import' | 'recurring'

export interface TransactionFields {
  kind: TransactionKind
  walletId: string
  date: string
  /** Minor units in the wallet's currency; negative takes from the balance. */
  amount: number
  note?: string
  /** TXN-03: a transfer's destination, and what arrived there in its currency. */
  toWalletId?: string
  toAmount?: number
  /** TXN-05: between currencies, millionths of the destination's unit per source unit. */
  rate?: number
  /** TXN-06 */
  excludeFromBudget?: boolean
  source?: TransactionSource
  createdAt?: string
  updatedAt?: string
}

export interface Transaction extends TransactionFields {
  id: string
}

/** Whether a kind is one a person records by hand, rather than one a wallet makes. */
export function isEntry(kind: TransactionKind): kind is EntryType {
  return kind === 'expense' || kind === 'income' || kind === 'transfer'
}

/**
 * What a transaction does to one wallet's balance: its amount in its own wallet, and
 * what arrived in a transfer's destination (TXN-03). Zero for any other wallet.
 */
export function changeTo(transaction: TransactionFields, walletId: string): number {
  let change = 0
  if (transaction.walletId === walletId) change += transaction.amount
  if (transaction.toWalletId === walletId) change += transaction.toAmount ?? 0
  return change
}

/**
 * Whether a transaction is money spent, money earned or neither. Transfers are neither
 * (TXN-03), so paying a credit card is not spending (TXN-04); refunds are income
 * (TXN-11). Opening balances, adjustments and market changes only set a balance.
 */
export function flow(transaction: TransactionFields): 'expense' | 'income' | null {
  switch (transaction.kind) {
    case 'expense':
    case 'fee':
      return 'expense'
    case 'income':
      return 'income'
    case 'interest':
      return transaction.amount < 0 ? 'expense' : 'income'
    default:
      return null
  }
}

/** TXN-01: an expense, income or transfer as a person enters it, before it is saved. */
export interface EntryDraft {
  type: EntryType
  /** Always entered positive; the type sets the direction (TXN fields: Amount). */
  amount: number
  walletId: string
  date: string
  /** Transfers only (TXN-03, TXN-05). */
  toWalletId?: string
  toAmount?: number
  rate?: number
  note?: string
  excludeFromBudget?: boolean
}

/** The record for a draft: an expense or transfer takes from its wallet, income adds. */
export function entryFields(
  draft: EntryDraft,
  source: TransactionSource,
  now: string,
  createdAt: string = now,
): TransactionFields {
  const note = draft.note?.trim()
  const amount = draft.type === 'income' ? draft.amount : -draft.amount
  return {
    kind: draft.type,
    walletId: draft.walletId,
    date: draft.date,
    amount,
    ...(note ? { note } : {}),
    ...(draft.type === 'transfer' && draft.toWalletId !== undefined
      ? {
          toWalletId: draft.toWalletId,
          toAmount: draft.toAmount ?? draft.amount,
          ...(draft.rate !== undefined ? { rate: draft.rate } : {}),
        }
      : {}),
    ...(draft.excludeFromBudget ? { excludeFromBudget: true } : {}),
    source,
    createdAt,
    updatedAt: now,
  }
}

/** The draft a saved expense, income or transfer opens as, to be changed. */
export function entryDraft(transaction: TransactionFields & { kind: EntryType }): EntryDraft {
  return {
    type: transaction.kind,
    amount: Math.abs(transaction.amount),
    walletId: transaction.walletId,
    date: transaction.date,
    ...(transaction.toWalletId !== undefined ? { toWalletId: transaction.toWalletId } : {}),
    ...(transaction.toAmount !== undefined ? { toAmount: transaction.toAmount } : {}),
    ...(transaction.rate !== undefined ? { rate: transaction.rate } : {}),
    ...(transaction.note !== undefined ? { note: transaction.note } : {}),
    ...(transaction.excludeFromBudget ? { excludeFromBudget: true } : {}),
  }
}

/**
 * WID-03: the wallet of the last expense, income or transfer the person made, which
 * new ones start in when no default wallet is set (WAL-24).
 */
export function lastUsedWallet(transactions: readonly Transaction[]): string | null {
  let last: Transaction | null = null
  for (const transaction of transactions) {
    if (!isEntry(transaction.kind)) continue
    // UUIDv7 ids start with when they were made.
    if (!last || transaction.id > last.id) last = transaction
  }
  return last?.walletId ?? null
}

export interface Day<T extends Transaction = Transaction> {
  date: string
  transactions: T[]
}

/** TXN-28: transactions, already newest first, grouped by day in the same order. */
export function byDay<T extends Transaction>(transactions: readonly T[]): Day<T>[] {
  const days: Day<T>[] = []
  for (const transaction of transactions) {
    const last = days.at(-1)
    if (last?.date === transaction.date) last.transactions.push(transaction)
    else days.push({ date: transaction.date, transactions: [transaction] })
  }
  return days
}

/**
 * TXN-28: what was spent across `transactions`, as a positive amount in `currency`.
 * Expenses in another currency count at the rate in use on their date (SYS-05); those
 * without a rate yet are left out.
 */
export function spent(
  transactions: readonly TransactionFields[],
  walletCurrency: ReadonlyMap<string, string>,
  currency: string,
  rates: readonly ExchangeRate[],
): number {
  let total = 0
  for (const transaction of transactions) {
    if (flow(transaction) !== 'expense') continue
    const from = walletCurrency.get(transaction.walletId)
    if (from === undefined) continue
    if (from === currency) {
      total -= transaction.amount
      continue
    }
    const inUse = rateInUse(from, currency, rates, transaction.date)
    if (inUse) total -= convert(transaction.amount, from, currency, inUse)
  }
  return total
}
