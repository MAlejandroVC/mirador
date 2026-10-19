import {
  type Category,
  type CategoryGroup,
  type Payee,
  type Tag,
  toDecimalString,
  type Transaction,
} from '@repo/core'
import { csvLine } from '@repo/import'

// DAT-02: every transaction as one row of a spreadsheet, with the names written out
// instead of ids, for Excel, Numbers or Google Sheets. The headers are ones Mirador's own
// import recognizes (IMP-02), so the file can come back in too.

export interface SpreadsheetLedger {
  wallets: readonly { id: string; name: string; currency: string }[]
  groups: readonly CategoryGroup[]
  categories: readonly Category[]
  tags: readonly Tag[]
  payees: readonly Payee[]
  transactions: readonly Transaction[]
}

export const spreadsheetHeader = [
  'Date',
  'Type',
  'Wallet',
  'Amount',
  'Currency',
  'Category',
  'Category group',
  'Tags',
  'Payee',
  'Note',
  'To wallet',
  'To amount',
  'To currency',
] as const

// The words the Type column uses, in English like the headers, so the file reads the
// same whatever language the app is in.
const typeWords: Record<Transaction['kind'], string> = {
  openingBalance: 'opening balance',
  adjustment: 'adjustment',
  interest: 'interest',
  fee: 'fee',
  valuation: 'valuation',
  expense: 'expense',
  income: 'income',
  transfer: 'transfer',
}

export function transactionsSpreadsheet(ledger: SpreadsheetLedger): string {
  const wallets = new Map(ledger.wallets.map((wallet) => [wallet.id, wallet]))
  const categories = new Map(ledger.categories.map((category) => [category.id, category]))
  const groups = new Map(ledger.groups.map((group) => [group.id, group]))
  const tags = new Map(ledger.tags.map((tag) => [tag.id, tag]))
  const payees = new Map(ledger.payees.map((payee) => [payee.id, payee]))
  const sorted = [...ledger.transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )
  const lines = [csvLine(spreadsheetHeader)]
  for (const transaction of sorted) {
    const wallet = wallets.get(transaction.walletId)
    const currency = wallet?.currency ?? ''
    const category = transaction.categoryId ? categories.get(transaction.categoryId) : undefined
    const to = transaction.toWalletId ? wallets.get(transaction.toWalletId) : undefined
    lines.push(
      csvLine([
        transaction.date,
        typeWords[transaction.kind],
        wallet?.name ?? '',
        currency ? toDecimalString(transaction.amount, currency) : String(transaction.amount),
        currency,
        category?.name ?? '',
        (category && groups.get(category.groupId)?.name) ?? '',
        (transaction.tagIds ?? []).flatMap((id) => tags.get(id)?.name ?? []).join(', '),
        (transaction.payeeId && payees.get(transaction.payeeId)?.name) ?? '',
        transaction.note ?? '',
        to?.name ?? '',
        to && transaction.toAmount !== undefined
          ? toDecimalString(transaction.toAmount, to.currency)
          : '',
        to?.currency ?? '',
      ]),
    )
  }
  // A byte order mark, so Excel reads accents as UTF-8.
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function spreadsheetFileName(date: string) {
  return `mirador-transactions-${date}.csv`
}
