import { importProfileRecord, importProfileRecordType } from '@repo/api'
import { newWallet as newWalletFields, presetDefaults } from '@repo/core'
import {
  buildImport,
  type CategoryLink,
  type ColumnSettings,
  type Decisions,
  guessColumns,
  headerKey,
  linkCategories,
  linkWallets,
  type PlannedRow,
  planRows,
  readRows,
  type Table,
  type WalletLink,
} from '@repo/import'
import type { Ledger, RecordChange } from '../wallets/use-ledger'
import { recordBody } from '../wallets/use-ledger'
import { presetLooks } from '../wallets/wallet-look'

// The import wizard's working state (IMP-01 to IMP-34) and how it becomes records.
// Pure functions over the ledger, so the screens only hold state and draw it.

export interface ImportFile {
  name: string
  fingerprint: string
  table: Table
}

/** IMP-03: the saved settings for these columns, or a fresh guess. */
export function startingSettings(file: ImportFile, ledger: Ledger) {
  const key = headerKey(file.table.header)
  const profile = ledger.profiles.find((item) => item.headerKey === key)
  const fits = profile?.columns.length === file.table.header.length
  if (profile && fits)
    return {
      profileId: profile.id,
      settings: {
        columns: profile.columns,
        dateOrder: profile.dateOrder,
        decimalMark: profile.decimalMark,
        amountSign: profile.amountSign,
      } satisfies ColumnSettings,
      walletId: profile.walletId ?? null,
    }
  return {
    profileId: null,
    settings: guessColumns(file.table.header, file.table.rows),
    walletId: null,
  }
}

/** IMP-01: a file with no wallet column goes into the default wallet, else the first. */
export function fallbackWallet(ledger: Ledger, remembered: string | null) {
  const active = ledger.wallets.filter((wallet) => wallet.active)
  return (
    active.find((wallet) => wallet.id === remembered)?.id ??
    active.find((wallet) => wallet.id === ledger.defaultWalletId)?.id ??
    active[0]?.id ??
    null
  )
}

export function readFileRows(file: ImportFile, settings: ColumnSettings, ledger: Ledger) {
  return readRows(file.table, settings, ledger.defaultCurrency)
}

export function links(
  file: ImportFile,
  settings: ColumnSettings,
  ledger: Ledger,
  fallbackWalletId: string | null,
) {
  const rows = readFileRows(file, settings, ledger)
  return {
    wallets: linkWallets(rows, ledger, fallbackWalletId, ledger.defaultCurrency),
    categories: linkCategories(rows, ledger),
  }
}

export function currencyOf(link: WalletLink, ledger: Ledger) {
  if (link.target.kind === 'new') return link.target.currency
  const id = link.target.id
  return ledger.wallets.find((wallet) => wallet.id === id)?.currency ?? ledger.defaultCurrency
}

export function plan(
  file: ImportFile,
  settings: ColumnSettings,
  ledger: Ledger,
  wallets: readonly WalletLink[],
) {
  return planRows(readFileRows(file, settings, ledger), ledger, wallets, (link) =>
    currencyOf(link, ledger),
  )
}

export interface BuildArgs {
  planned: readonly PlannedRow[]
  wallets: readonly WalletLink[]
  categories: readonly CategoryLink[]
  decisions: Decisions
  ledger: Ledger
  file: { name: string; fingerprint?: string; source: 'csv' | 'sample' }
  names: { wallet: string; group: string }
  /** IMP-02: remember the columns for files like this one. */
  profile?: {
    id: string | null
    header: readonly string[]
    settings: ColumnSettings
    walletId: string | null
  }
  newId: () => string
}

export function buildChanges(args: BuildArgs): {
  changes: RecordChange[]
  batch: ReturnType<typeof buildImport>['batch']
  batchId: string
} {
  const uncategorized = args.ledger.categories.find((c) => c.systemKey === 'uncategorized')
  if (!uncategorized) throw new Error('The starter categories are not there yet')
  const result = buildImport({
    planned: args.planned,
    wallets: args.wallets,
    categories: args.categories,
    decisions: args.decisions,
    ledger: args.ledger,
    uncategorizedId: uncategorized.id,
    file: args.file,
    // WAL-11, WAL-23: the preset's features and look, as the wallet form gives them.
    newWallet: (target, name) => ({
      ...newWalletFields(name, target.currency, target.preset),
      ...presetLooks[target.preset],
    }),
    names: args.names,
    newId: args.newId,
    now: new Date(),
  })
  const changes = [...result.changes]
  if (args.profile) {
    const { settings, header, walletId } = args.profile
    changes.push({
      id: args.profile.id ?? args.newId(),
      body: recordBody(
        importProfileRecordType,
        importProfileRecord.parse({
          headerKey: headerKey(header),
          ...settings,
          ...(walletId && !settings.columns.includes('wallet') ? { walletId } : {}),
        }),
      ),
    })
  }
  return { changes, batch: result.batch, batchId: result.batchId }
}

/** WAL-05: whether a preset's balance is usually money owed, like a card's. */
export function owes(preset: keyof typeof presetDefaults) {
  return presetDefaults[preset].owed
}
