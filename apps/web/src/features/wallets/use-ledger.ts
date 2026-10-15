import {
  type ExchangeRateRecord,
  exchangeRateRecord,
  exchangeRateRecordType,
  maxPushChanges,
  preferencesRecord,
  preferencesRecordType,
  type RecordBody,
  type TransactionRecord,
  transactionRecord,
  transactionRecordType,
  type WalletRecord,
  walletRecord,
  walletRecordType,
} from '@repo/api'
import { type ExchangeRate, guessCurrency, sortWallets, type Transaction } from '@repo/core'
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
  /** SYS-01: the person's choice, or a guess from the device language until they make one. */
  defaultCurrency: string
  preferencesId: string | null
}

async function readLedger(vault: VaultClient): Promise<Ledger> {
  const wallets: LedgerWallet[] = []
  const transactions: Transaction[] = []
  const rates: ExchangeRate[] = []
  let preferences: { id: string; defaultCurrency: string } | null = null
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
      case preferencesRecordType: {
        const parsed = preferencesRecord.safeParse(body.data)
        if (parsed.success) preferences = { id, defaultCurrency: parsed.data.defaultCurrency }
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
    defaultCurrency: preferences?.defaultCurrency ?? guessCurrency(globalThis.navigator.language),
    preferencesId: preferences?.id ?? null,
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

export function preferencesChange(id: string | null, defaultCurrency: string): RecordChange {
  return {
    id: id ?? newRecordId(),
    body: {
      deleted: false,
      type: preferencesRecordType,
      schema: 1,
      data: preferencesRecord.parse({ defaultCurrency }),
    },
  }
}

/** A wallet saved with some of its fields changed, such as one feature's details. */
export function walletChange(wallet: LedgerWallet, patch: Partial<WalletRecord>): RecordChange {
  const { id, ...record } = wallet
  return { id, body: walletBody(walletRecord.parse({ ...record, ...patch })) }
}
