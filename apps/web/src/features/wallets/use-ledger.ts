import {
  categoryGroupRecord,
  categoryGroupRecordType,
  categoryRecord,
  categoryRecordType,
  type ExchangeRateRecord,
  exchangeRateRecord,
  exchangeRateRecordType,
  type ImportBatchRecord,
  importBatchRecord,
  importBatchRecordType,
  type ImportProfileRecord,
  importProfileRecord,
  importProfileRecordType,
  maxPushChanges,
  payeeRecord,
  payeeRecordType,
  type PreferencesRecord,
  preferencesRecord,
  preferencesRecordType,
  type RecordBody,
  recurringRecord,
  recurringRecordType,
  tagRecord,
  tagRecordType,
  type TransactionRecord,
  transactionRecord,
  transactionRecordType,
  type WalletRecord,
  walletRecord,
  walletRecordType,
} from '@repo/api'
import {
  balanceTransactions,
  type Category,
  type CategoryGroup,
  type ExchangeRate,
  guessCurrency,
  inOrder,
  type Payee,
  type Recurring,
  sortWallets,
  type Tag,
  type Transaction,
  withoutDuplicateSystem,
  withoutRepeatedOccurrences,
} from '@repo/core'
import { newRecordId } from '@repo/crypto'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { VaultClient } from '../../lib/vault'
import { useVault } from '../security/hooks/vault'

// The wallets, their transactions and the default currency, read from the worker's
// decrypted records. Every change is saved through @repo/sync, encrypted before it
// leaves (SEC-01), as one batch the server takes whole or not at all (NFR-08).

export const ledgerKey = ['ledger'] as const

/** A wallet as the screens use it: the record, with its icon and color, and its id. */
export interface LedgerWallet extends WalletRecord {
  id: string
}

export interface Ledger {
  wallets: LedgerWallet[]
  transactions: Transaction[]
  /** SYS-04, SYS-05: every exchange rate entered, with its date. */
  rates: ExchangeRate[]
  /** Epic 4: the person's category groups and categories, in their order, and tags. */
  groups: CategoryGroup[]
  categories: Category[]
  tags: Tag[]
  payees: Payee[]
  /** TXN-09: the recurring transactions, ended ones included. */
  recurring: Recurring[]
  /** SYS-01: the person's choice, or a guess from the device language until they make one. */
  defaultCurrency: string
  /** WAL-24: the wallet new transactions start in, if the person chose one. */
  defaultWalletId: string | null
  preferencesId: string | null
  preferences: PreferencesRecord | null
  /** IMP-34: the imports, newest first, each of which can be undone (IMP-35). */
  batches: (ImportBatchRecord & { id: string })[]
  /** IMP-02, IMP-03: how to read files with columns seen before. */
  profiles: (ImportProfileRecord & { id: string })[]
}

async function readLedger(vault: VaultClient): Promise<Ledger> {
  const wallets: LedgerWallet[] = []
  const transactions: Transaction[] = []
  const rates: ExchangeRate[] = []
  const groups: CategoryGroup[] = []
  const categories: Category[] = []
  const tags: Tag[] = []
  const payees: Payee[] = []
  const recurring: Recurring[] = []
  const batches: Ledger['batches'] = []
  const profiles: Ledger['profiles'] = []
  let preferences: (PreferencesRecord & { id: string }) | null = null
  for (const { id, body } of await vault.listRecords()) {
    if (body.deleted) continue
    switch (body.type) {
      case walletRecordType: {
        const parsed = walletRecord.safeParse(body.data)
        if (parsed.success) wallets.push({ id, ...parsed.data })
        break
      }
      case transactionRecordType: {
        const parsed = transactionRecord.safeParse(body.data)
        if (parsed.success) transactions.push({ id, ...parsed.data })
        break
      }
      case exchangeRateRecordType: {
        const parsed = exchangeRateRecord.safeParse(body.data)
        if (parsed.success) rates.push({ id, ...parsed.data })
        break
      }
      case categoryGroupRecordType: {
        const parsed = categoryGroupRecord.safeParse(body.data)
        if (parsed.success) groups.push({ id, ...parsed.data })
        break
      }
      case categoryRecordType: {
        const parsed = categoryRecord.safeParse(body.data)
        if (parsed.success) categories.push({ id, ...parsed.data })
        break
      }
      case tagRecordType: {
        const parsed = tagRecord.safeParse(body.data)
        if (parsed.success) tags.push({ id, ...parsed.data })
        break
      }
      case payeeRecordType: {
        const parsed = payeeRecord.safeParse(body.data)
        if (parsed.success) payees.push({ id, ...parsed.data })
        break
      }
      case recurringRecordType: {
        const parsed = recurringRecord.safeParse(body.data)
        if (parsed.success) recurring.push({ id, ...parsed.data })
        break
      }
      case importBatchRecordType: {
        const parsed = importBatchRecord.safeParse(body.data)
        if (parsed.success) batches.push({ id, ...parsed.data })
        break
      }
      case importProfileRecordType: {
        const parsed = importProfileRecord.safeParse(body.data)
        if (parsed.success) profiles.push({ id, ...parsed.data })
        break
      }
      case preferencesRecordType: {
        const parsed = preferencesRecord.safeParse(body.data)
        if (parsed.success) preferences = { id, ...parsed.data }
        break
      }
      default:
        break
    }
  }
  return {
    // WAL-10: the person's order; the rest in the order they were added (UUIDv7 ids
    // start with their creation time).
    wallets: sortWallets(wallets),
    // TXN-10: a date two devices both added counts once.
    transactions: withoutRepeatedOccurrences(transactions),
    rates,
    groups: inOrder(groups),
    categories: inOrder(withoutDuplicateSystem(categories)),
    tags: [...tags].sort((a, b) => a.name.localeCompare(b.name)),
    payees,
    recurring,
    defaultCurrency: preferences?.defaultCurrency ?? guessCurrency(globalThis.navigator.language),
    defaultWalletId: preferences?.defaultWalletId ?? null,
    preferencesId: preferences?.id ?? null,
    preferences: preferences && preferencesRecord.parse(preferences),
    batches: batches.sort((a, b) => b.importedAt.localeCompare(a.importedAt)),
    profiles,
  }
}

/**
 * TXN-30: the transactions as wallet balances count them on `today`: a purchase in
 * installments leaves a wallet without credit one part at a time.
 */
export function balanceEntries(ledger: Ledger, today: string) {
  const credit = new Set(
    ledger.wallets.filter((wallet) => wallet.features.includes('creditLimit')).map((w) => w.id),
  )
  return balanceTransactions(ledger.transactions, credit, today)
}

export function useLedger() {
  const vault = useVault()
  return useQuery({ queryKey: ledgerKey, queryFn: () => readLedger(vault) })
}

export const walletBody = (data: WalletRecord): RecordBody => ({
  deleted: false,
  type: walletRecordType,
  schema: 1,
  data,
})

export const transactionBody = (data: TransactionRecord): RecordBody => ({
  deleted: false,
  type: transactionRecordType,
  schema: 1,
  data,
})

export const exchangeRateBody = (data: ExchangeRateRecord): RecordBody => ({
  deleted: false,
  type: exchangeRateRecordType,
  schema: 1,
  data,
})

/** Any record, ready to save (SEC-01: it is encrypted in the worker before it leaves). */
export const recordBody = (type: string, data: unknown): RecordBody => ({
  deleted: false,
  type,
  schema: 1,
  data,
})

export interface RecordChange {
  id: string
  body: RecordBody
}

/** Saves records, at most one push's worth per batch, then reloads the ledger. */
export function useSaveRecords() {
  const vault = useVault()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (changes: RecordChange[]) => {
      // A wallet with more transactions than one push takes is deleted in several;
      // the wallet itself goes last, so an interrupted delete can simply be retried.
      for (let start = 0; start < changes.length; start += maxPushChanges)
        await vault.saveRecords(changes.slice(start, start + maxPushChanges))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ledgerKey }),
  })
}

export function newId() {
  return newRecordId()
}

/**
 * The preferences record with some settings changed and the rest kept as they are.
 * Until the person changes one, there is no record yet, and the default currency is
 * the guess they have been seeing.
 */
export function preferencesChange(
  ledger: Pick<Ledger, 'preferencesId' | 'preferences' | 'defaultCurrency'>,
  patch: Partial<PreferencesRecord> & { defaultWalletId?: string | undefined },
): RecordChange {
  const merged: Record<string, unknown> = {
    defaultCurrency: ledger.defaultCurrency,
    ...ledger.preferences,
    ...patch,
  }
  // Clearing the default wallet leaves the setting out.
  if (merged.defaultWalletId === undefined) delete merged.defaultWalletId
  return {
    id: ledger.preferencesId ?? newRecordId(),
    body: {
      deleted: false,
      type: preferencesRecordType,
      schema: 1,
      data: preferencesRecord.parse(merged),
    },
  }
}

/** A wallet saved with some of its fields changed, such as one feature's details. */
export function walletChange(wallet: LedgerWallet, patch: Partial<WalletRecord>): RecordChange {
  const { id, ...record } = wallet
  return { id, body: walletBody(walletRecord.parse({ ...record, ...patch })) }
}
