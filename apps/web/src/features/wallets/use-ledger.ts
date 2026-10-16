import {
  categoryGroupRecord,
  categoryGroupRecordType,
  categoryRecord,
  categoryRecordType,
  type ExchangeRateRecord,
  exchangeRateRecord,
  exchangeRateRecordType,
  maxPushChanges,
  payeeRecord,
  payeeRecordType,
  type PreferencesRecord,
  preferencesRecord,
  preferencesRecordType,
  type RecordBody,
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
  type Category,
  type CategoryGroup,
  type ExchangeRate,
  guessCurrency,
  inOrder,
  type Payee,
  sortWallets,
  type Tag,
  type Transaction,
  withoutDuplicateSystem,
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
  /** SYS-01: the person's choice, or a guess from the device language until they make one. */
  defaultCurrency: string
  /** WAL-24: the wallet new transactions start in, if the person chose one. */
  defaultWalletId: string | null
  preferencesId: string | null
  preferences: PreferencesRecord | null
}

async function readLedger(vault: VaultClient): Promise<Ledger> {
  const wallets: LedgerWallet[] = []
  const transactions: Transaction[] = []
  const rates: ExchangeRate[] = []
  const groups: CategoryGroup[] = []
  const categories: Category[] = []
  const tags: Tag[] = []
  const payees: Payee[] = []
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
    transactions,
    rates,
    groups: inOrder(groups),
    categories: inOrder(withoutDuplicateSystem(categories)),
    tags: [...tags].sort((a, b) => a.name.localeCompare(b.name)),
    payees,
    defaultCurrency: preferences?.defaultCurrency ?? guessCurrency(globalThis.navigator.language),
    defaultWalletId: preferences?.defaultWalletId ?? null,
    preferencesId: preferences?.id ?? null,
    preferences: preferences && preferencesRecord.parse(preferences),
  }
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
