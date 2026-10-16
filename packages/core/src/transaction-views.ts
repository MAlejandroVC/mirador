import type { Transaction, TransactionSource } from './transactions.ts'

// TXN-21 to TXN-24: sorting and filtering the transaction list. Pure functions: the
// screen passes what it knows about wallets, categories and payees as lookups.

/** What a row is, for the Type filter: balance changes are what wallets make (WAL). */
export type FlowType = 'expense' | 'income' | 'transfer' | 'balance'

export function flowType(transaction: Pick<Transaction, 'kind' | 'amount'>): FlowType {
  switch (transaction.kind) {
    case 'expense':
    case 'fee':
      return 'expense'
    case 'income':
      return 'income'
    case 'interest':
      return transaction.amount < 0 ? 'expense' : 'income'
    case 'transfer':
      return 'transfer'
    default:
      return 'balance'
  }
}

/** TXN-21 */
export type TransactionSort =
  'newest' | 'oldest' | 'largest' | 'smallest' | 'category' | 'group' | 'wallet'

/** TXN-22, TXN-23: every filter is optional; an empty list means "any". */
export interface TransactionFilter {
  types?: FlowType[]
  walletIds?: string[]
  groupIds?: string[]
  categoryIds?: string[]
  /** A transaction matches when it has any of these tags. */
  tagIds?: string[]
  payeeIds?: string[]
  /** Positive minor units, compared with the amount's size in its own currency. */
  minAmount?: number
  maxAmount?: number
  /** Found in the note or the payee's name, ignoring case and accents. */
  text?: string
  sources?: TransactionSource[]
  /** TXN-23: only those left out of the budget, or only those in it. */
  budget?: 'excluded' | 'included'
}

/** What the filters need to know about a transaction beyond its own fields. */
export interface TransactionLookups {
  categoryId: (transaction: Transaction) => string | null
  groupId: (transaction: Transaction) => string | null
  payeeName: (transaction: Transaction) => string | null
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()

const some = <T>(list: readonly T[] | undefined): list is readonly T[] =>
  list !== undefined && list.length > 0

/** How many filters are on, for the Filter button's badge. */
export function activeFilters(filter: TransactionFilter): number {
  return [
    some(filter.types),
    some(filter.walletIds),
    some(filter.groupIds),
    some(filter.categoryIds),
    some(filter.tagIds),
    some(filter.payeeIds),
    filter.minAmount !== undefined || filter.maxAmount !== undefined,
    (filter.text ?? '').trim() !== '',
    some(filter.sources),
    filter.budget !== undefined,
  ].filter(Boolean).length
}

/** TXN-22, TXN-23: whether a transaction passes every filter that is on. */
export function matchesFilter(
  transaction: Transaction,
  filter: TransactionFilter,
  lookups: TransactionLookups,
): boolean {
  if (some(filter.types) && !filter.types.includes(flowType(transaction))) return false
  if (
    some(filter.walletIds) &&
    !filter.walletIds.includes(transaction.walletId) &&
    !(transaction.toWalletId !== undefined && filter.walletIds.includes(transaction.toWalletId))
  )
    return false
  if (some(filter.categoryIds)) {
    const id = lookups.categoryId(transaction)
    if (id === null || !filter.categoryIds.includes(id)) return false
  }
  if (some(filter.groupIds)) {
    const id = lookups.groupId(transaction)
    if (id === null || !filter.groupIds.includes(id)) return false
  }
  if (some(filter.tagIds)) {
    const tags = transaction.tagIds ?? []
    if (!filter.tagIds.some((tag) => tags.includes(tag))) return false
  }
  if (
    some(filter.payeeIds) &&
    (transaction.payeeId === undefined || !filter.payeeIds.includes(transaction.payeeId))
  )
    return false
  const size = Math.abs(transaction.amount)
  if (filter.minAmount !== undefined && size < filter.minAmount) return false
  if (filter.maxAmount !== undefined && size > filter.maxAmount) return false
  const text = fold(filter.text?.trim() ?? '')
  if (text !== '') {
    const haystack = fold(`${transaction.note ?? ''} ${lookups.payeeName(transaction) ?? ''}`)
    if (!haystack.includes(text)) return false
  }
  if (some(filter.sources) && !filter.sources.includes(transaction.source ?? 'manual')) return false
  if (filter.budget === 'excluded' && !transaction.excludeFromBudget) return false
  if (filter.budget === 'included' && transaction.excludeFromBudget) return false
  return true
}

/** What sorting needs to know about a transaction beyond its own fields. */
export interface SortLookups {
  /** Its size in the default currency, so amounts in other currencies compare fairly. */
  size: (transaction: Transaction) => number
  categoryName: (transaction: Transaction) => string
  groupName: (transaction: Transaction) => string
  walletName: (transaction: Transaction) => string
}

/** TXN-21: the transactions in the chosen order; ties go newest first. */
export function sortTransactions<T extends Transaction>(
  transactions: readonly T[],
  sort: TransactionSort,
  lookups: SortLookups,
): T[] {
  const newest = (a: T, b: T) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
  const byText = (text: (transaction: Transaction) => string) => (a: T, b: T) =>
    text(a).localeCompare(text(b)) || newest(a, b)
  const compare: Record<TransactionSort, (a: T, b: T) => number> = {
    newest,
    oldest: (a, b) => -newest(a, b),
    largest: (a, b) => lookups.size(b) - lookups.size(a) || newest(a, b),
    smallest: (a, b) => lookups.size(a) - lookups.size(b) || newest(a, b),
    category: byText(lookups.categoryName),
    group: byText(lookups.groupName),
    wallet: byText(lookups.walletName),
  }
  return [...transactions].sort(compare[sort])
}
