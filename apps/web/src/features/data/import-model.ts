import { importProfileRecord, importProfileRecordType } from '@repo/api'
import { newWallet as newWalletFields, presetDefaults } from '@repo/core'
import {
  buildImport,
  type CategoryLink,
  type ColumnSettings,
  type Decisions,
  applyUpdates,
  guessColumns,
  guessStatementColumns,
  headerKey,
  type InstallmentMark,
  linkCategories,
  linkWallets,
  type PlannedRow,
  planRows,
  readRows,
  type StatementTable,
  type Table,
  type Box,
  type DateOrder,
  type FactKey,
  findLabeled,
  type StatementFact,
  type TextWord,
  walletUpdates,
  type WalletLink,
  type WalletUpdate,
} from '@repo/import'
import type { Ledger, RecordChange } from '../wallets/use-ledger'
import { recordBody } from '../wallets/use-ledger'
import { presetLooks } from '../wallets/wallet-look'

// The import wizard's working state (IMP-01 to IMP-34) and how it becomes records.
// Pure functions over the ledger, so the screens only hold state and draw it.

export interface ImportFile {
  name: string
  fingerprint: string
  table: Table | StatementTable
  /** IMP-04, IMP-05: the pictures of a statement's pages, by page, where there are some. */
  pages?: readonly (PagePicture | null)[]
  /** IMP-01: the wallet chosen for a statement before it was read. */
  walletId?: string
}

export interface PagePicture {
  url: string
  width: number
  height: number
  /** IMP-40: the words read on it, in the page's units, for a box drawn around a row. */
  words: readonly TextWord[]
}

/** A statement read from PDFs or pictures rather than a CSV. */
export function isStatement(file: ImportFile): file is ImportFile & { table: StatementTable } {
  return 'sources' in file.table
}

/** IMP-10, IMP-40: what the person put right on a row, by line. */
export interface Fix {
  date: string
  amount: number
  payee?: string
  /** TXN-30: null when it isn't a month of a plan after all. */
  installment?: InstallmentMark | null
  /** IMP-09, IMP-40: the other wallet of a transfer; null when it isn't one. */
  transferWith?: string | null
}

/** IMP-14, IMP-37: the labels of a statement's totals and dates, by fact. */
export type FactLabels = Partial<Record<FactKey, string>>
export type Fixes = ReadonlyMap<number, Fix>

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
        ...(profile.installments !== undefined ? { installments: profile.installments } : {}),
      } satisfies ColumnSettings,
      walletId: profile.walletId ?? null,
      factLabels: (profile.facts ?? {}) as FactLabels,
    }
  return {
    factLabels: {} as FactLabels,
    profileId: null,
    // IMP-13: a statement's columns come from the column model.
    settings: isStatement(file)
      ? guessStatementColumns(file.table)
      : guessColumns(file.table.header, file.table.rows),
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

export function readFileRows(
  file: ImportFile,
  settings: ColumnSettings,
  ledger: Ledger,
  fixes: Fixes = new Map(),
) {
  return readRows(file.table, settings, ledger.defaultCurrency).map((row) => {
    const fix = fixes.get(row.line)
    if (!fix) return row
    // Checked by the person: no longer unsure, and read again for matching.
    const fixed = {
      ...row,
      date: fix.date,
      amount: fix.amount,
      problem: null,
      ...(fix.payee !== undefined ? { payee: fix.payee } : {}),
    }
    delete fixed.unsure
    if (fix.transferWith !== undefined) fixed.transferWith = fix.transferWith
    if (fix.installment === null) delete fixed.installment
    else if (fix.installment) fixed.installment = fix.installment
    return fixed
  })
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
  fixes?: Fixes,
) {
  return planRows(readFileRows(file, settings, ledger, fixes), ledger, wallets, (link) =>
    currencyOf(link, ledger),
  )
}

export interface BuildArgs {
  planned: readonly PlannedRow[]
  wallets: readonly WalletLink[]
  categories: readonly CategoryLink[]
  decisions: Decisions
  ledger: Ledger
  file: { name: string; fingerprint?: string; source: 'csv' | 'statement' | 'sample' }
  /** IMP-29, IMP-39: the wallet changes the person kept on, made with the import. */
  updates?: { list: readonly WalletUpdate[]; walletId: string }
  names: { wallet: string; group: string }
  /** IMP-02: remember the columns for files like this one. */
  profile?: {
    id: string | null
    header: readonly string[]
    settings: ColumnSettings
    walletId: string | null
    /** IMP-14, IMP-37: labels for the statement's totals and dates. */
    facts?: FactLabels
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
  const wallet = args.updates
    ? args.ledger.wallets.find((item) => item.id === args.updates?.walletId)
    : undefined
  const applied =
    wallet && args.updates
      ? applyUpdates(args.updates.list, wallet, args.ledger.recurring)
      : { changes: [], settings: undefined }
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
    ...(applied.settings ? { settings: applied.settings } : {}),
  })
  const changes = [...result.changes, ...applied.changes]
  if (args.profile) {
    const { settings, header, walletId, facts } = args.profile
    changes.push({
      id: args.profile.id ?? args.newId(),
      body: recordBody(
        importProfileRecordType,
        importProfileRecord.parse({
          headerKey: headerKey(header),
          ...settings,
          ...(facts && Object.keys(facts).length > 0 ? { facts } : {}),
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

/**
 * IMP-40: a row the person drew a box around, added to the statement so it is read,
 * matched and imported like the others. Its cells are as read; the person's values
 * come in as a fix on its line.
 */
export function addRow(
  file: ImportFile & { table: StatementTable },
  page: number,
  box: Box,
  cells: { date: string; payee: string; amount: string },
): { file: ImportFile; line: number } {
  const width = file.table.header.length
  const row = [
    cells.date,
    cells.payee,
    cells.amount,
    ...new Array<string>(Math.max(0, width - 3)).fill(''),
  ]
  return {
    file: {
      ...file,
      table: {
        ...file.table,
        rows: [...file.table.rows, row.slice(0, width)],
        sources: [...file.table.sources, { page, box, unsure: [], fields: {} }],
      },
    },
    line: file.table.rows.length + 2,
  }
}

/** IMP-29, IMP-39: what the statement shows differently about its wallet. */
export function updatesFor(
  file: ImportFile,
  ledger: Ledger,
  walletId: string | null,
  planned: readonly PlannedRow[],
  settings: ColumnSettings,
): WalletUpdate[] {
  const wallet = ledger.wallets.find((item) => item.id === walletId)
  if (!wallet || !isStatement(file)) return []
  return walletUpdates({
    wallet,
    facts: file.table.facts,
    planned,
    recurring: ledger.recurring,
    payees: ledger.payees,
    decimalMark: settings.decimalMark,
  })
}

/**
 * IMP-37, IMP-40: a total or date the person showed by drawing a box around it, kept
 * with the statement so its checks and the wallet's updates (IMP-39) use it.
 */
export function withFact(
  file: ImportFile & { table: StatementTable },
  key: FactKey,
  fact: StatementFact,
): ImportFile & { table: StatementTable } {
  const facts = { ...file.table.facts, [key]: fact } as StatementTable['facts']
  return { ...file, table: { ...file.table, ...(facts ? { facts } : {}) } }
}

/**
 * IMP-14: the totals and dates the reader missed, found by the labels the person
 * showed on an earlier statement with the same layout.
 */
export function learnedFacts(
  file: ImportFile & { table: StatementTable },
  labels: FactLabels,
  options: { year: number; order: DateOrder },
): ImportFile & { table: StatementTable } {
  const pages = (file.pages ?? []).map((page) =>
    page ? { width: page.width, height: page.height, words: [...page.words] } : null,
  )
  let next = file
  for (const [key, label] of Object.entries(labels) as [FactKey, string][]) {
    if (next.table.facts?.[key] || !label) continue
    // Pages without a picture keep their place, so a fact's page stays right.
    const found = findLabeled(
      pages.map((page) => page ?? { width: 1, height: 1, words: [] }),
      key,
      label,
      options,
    )
    if (found) next = withFact(next, key, found)
  }
  return next
}
