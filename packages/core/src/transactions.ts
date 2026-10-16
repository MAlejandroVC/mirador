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
  /** CAT-20, TXN-15: expenses and income only. */
  categoryId?: string
  tagIds?: string[]
  payeeId?: string
  /** TXN-06 */
  excludeFromBudget?: boolean
  source?: TransactionSource
  /** TXN-30: an expense the card bills in monthly installments. */
  installments?: InstallmentPlan
  /** TXN-10: the recurring transaction that added it, and for which date. */
  recurringId?: string
  occurrence?: string
  createdAt?: string
  updatedAt?: string
}

/**
 * TXN-30 to TXN-33: how a card bills a purchase. The transaction's amount is all the
 * card charges, interest included (TXN-31).
 */
export interface InstallmentPlan {
  months: number
  /** TXN-31: with interest, the price before it. */
  price?: number
  /** The first installment comes this many statements later. */
  deferred?: number
  /** TXN-33: paid off early on this date. */
  paidOff?: string
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
  /** Expenses and income only (CAT-20, TXN-15). */
  categoryId?: string
  tagIds?: string[]
  payeeId?: string
  excludeFromBudget?: boolean
  /** Expenses only (TXN-30); `amount` is then all the card charges. */
  installments?: InstallmentPlan
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
    ...(draft.type !== 'transfer' && draft.categoryId !== undefined
      ? { categoryId: draft.categoryId }
      : {}),
    ...(draft.type !== 'transfer' && draft.tagIds && draft.tagIds.length > 0
      ? { tagIds: [...new Set(draft.tagIds)] }
      : {}),
    ...(draft.payeeId !== undefined ? { payeeId: draft.payeeId } : {}),
    ...(draft.excludeFromBudget ? { excludeFromBudget: true } : {}),
    ...(draft.type === 'expense' && draft.installments ? { installments: draft.installments } : {}),
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
    ...(transaction.categoryId !== undefined ? { categoryId: transaction.categoryId } : {}),
    ...(transaction.tagIds !== undefined ? { tagIds: transaction.tagIds } : {}),
    ...(transaction.payeeId !== undefined ? { payeeId: transaction.payeeId } : {}),
    ...(transaction.excludeFromBudget ? { excludeFromBudget: true } : {}),
    ...(transaction.installments ? { installments: transaction.installments } : {}),
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
 * A transaction's amount in `currency`, at the rate in use on its date (SYS-05), or
 * null when its wallet uses another currency with no rate entered yet.
 */
export function amountIn(
  transaction: TransactionFields,
  walletCurrency: ReadonlyMap<string, string>,
  currency: string,
  rates: readonly ExchangeRate[],
): number | null {
  const from = walletCurrency.get(transaction.walletId)
  if (from === undefined) return null
  if (from === currency) return transaction.amount
  const inUse = rateInUse(from, currency, rates, transaction.date)
  return inUse ? convert(transaction.amount, from, currency, inUse) : null
}

/** Money in, money out and what is left, as positive amounts except `net`. */
export interface FlowTotals {
  income: number
  expenses: number
  /** Income minus expenses. */
  net: number
}

/**
 * TXN-24, TXN-28: the income, expenses and net of `transactions` in `currency`.
 * Transfers and balance changes count as neither (TXN-03); amounts in another currency
 * count at the rate in use on their date, and those without a rate are left out.
 */
export function flowTotals(
  transactions: readonly TransactionFields[],
  walletCurrency: ReadonlyMap<string, string>,
  currency: string,
  rates: readonly ExchangeRate[],
): FlowTotals {
  let income = 0
  let expenses = 0
  for (const transaction of transactions) {
    const direction = flow(transaction)
    if (direction === null) continue
    const amount = amountIn(transaction, walletCurrency, currency, rates)
    if (amount === null) continue
    if (direction === 'income') income += amount
    else expenses -= amount
  }
  return { income, expenses, net: income - expenses }
}

/** TXN-28: what was spent across `transactions`, as a positive amount in `currency`. */
export function spent(
  transactions: readonly TransactionFields[],
  walletCurrency: ReadonlyMap<string, string>,
  currency: string,
  rates: readonly ExchangeRate[],
): number {
  return flowTotals(transactions, walletCurrency, currency, rates).expenses
}
