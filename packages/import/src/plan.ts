import {
  type Category,
  type CategoryGroup,
  changeTo,
  daysBetween,
  type Payee,
  payeeMemory,
  type Transaction,
} from '@repo/core'
import type { ImportRow } from './rows.ts'
import { nameKey } from './values.ts'

// IMP-20 to IMP-23, IMP-30, IMP-31: from the rows read to what the review shows. Rows
// the app is sure of go straight in; only the unsure ones are put to the person, each
// with a sensible default, so most imports need nothing but one tap.

export interface PlanWallet {
  id: string
  name: string
  currency: string
}

export interface PlanLedger {
  wallets: readonly PlanWallet[]
  groups: readonly CategoryGroup[]
  categories: readonly Category[]
  payees: readonly Payee[]
  transactions: readonly Transaction[]
}

export type WalletPreset =
  'cash' | 'checking' | 'savings' | 'investment' | 'creditCard' | 'loan' | 'voucher' | 'generic'

/** Where the rows of one wallet name in the file go. */
export type WalletTarget =
  | { kind: 'existing'; id: string }
  | {
      kind: 'new'
      name: string
      preset: WalletPreset
      currency: string
      balanceToday: number | null
    }

export interface WalletLink {
  /** The name in the file; '' when the file has no wallet column (IMP-01). */
  name: string
  rows: number
  target: WalletTarget
}

/** Where the rows of one category name in the file go. */
export type CategoryTarget =
  | { kind: 'existing'; id: string }
  | {
      kind: 'new'
      name: string
      group: { kind: 'existing'; id: string } | { kind: 'new'; name: string }
    }

export interface CategoryLink {
  key: string
  name: string
  group: string
  type: 'expense' | 'income'
  rows: number
  target: CategoryTarget
}

const linkKey = (row: Pick<ImportRow, 'group' | 'category'>) =>
  `${nameKey(row.group)}/${nameKey(row.category)}`

// A wallet's name says what it is often enough to start it with the right features.
const presetWords: [WalletPreset, RegExp][] = [
  ['creditCard', /credit|credito|tarjeta|card|tdc|amex|visa|mastercard/],
  ['cash', /cash|efectivo|cartera|wallet/],
  ['savings', /saving|ahorro|cajita|apartado/],
  ['investment', /invest|inversion|broker|gbm|cetes|stock|fondo/],
  ['loan', /loan|prestamo|credito hipotecario|mortgage|hipoteca/],
  ['voucher', /vale|voucher|despensa|gift/],
  ['checking', /debit|debito|checking|nomina|cuenta|bank|banco/],
]

export function guessPreset(name: string): WalletPreset {
  const key = nameKey(name)
  for (const [preset, pattern] of presetWords) if (pattern.test(key)) return preset
  return 'generic'
}

/**
 * IMP-01: the wallets in the file, each matched by name to one of the person's or
 * made new. A file without a wallet column goes into `fallbackWalletId`.
 */
export function linkWallets(
  rows: readonly ImportRow[],
  ledger: PlanLedger,
  fallbackWalletId: string | null,
  defaultCurrency: string,
): WalletLink[] {
  const counts = new Map<string, { name: string; rows: number; currency: string }>()
  for (const row of rows) {
    const key = nameKey(row.wallet)
    const entry = counts.get(key) ?? { name: row.wallet, rows: 0, currency: row.currency }
    entry.rows += 1
    counts.set(key, entry)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].rows - a[1].rows)
    .map(([key, { name, rows: count, currency }]) => {
      const existing = ledger.wallets.find((wallet) => nameKey(wallet.name) === key)
      // Rows without a wallet go into the fallback when it has their currency, else
      // into another wallet that does, else into a new one: a file in pesos isn't put
      // into a dollar wallet to fail on every row.
      const chosen = ledger.wallets.find((wallet) => wallet.id === fallbackWalletId)
      const fallback =
        chosen?.currency === currency
          ? chosen
          : ledger.wallets.find((wallet) => wallet.currency === currency)
      const target: WalletTarget = existing
        ? { kind: 'existing', id: existing.id }
        : name === '' && fallback
          ? { kind: 'existing', id: fallback.id }
          : {
              kind: 'new',
              name: name === '' ? '' : name,
              preset: guessPreset(name),
              currency: currency || defaultCurrency,
              balanceToday: null,
            }
      return { name, rows: count, target }
    })
}

/**
 * The category names in the file, each matched by name to one of the person's that
 * takes the same direction, or made new in the group the file names (or an existing
 * group of that name). Names compare without case or accents.
 */
export function linkCategories(rows: readonly ImportRow[], ledger: PlanLedger): CategoryLink[] {
  const found = new Map<string, { row: ImportRow; out: number; in: number }>()
  for (const row of rows) {
    if (row.category === '' || row.amount === null || row.amount === 0) continue
    const key = linkKey(row)
    const entry = found.get(key) ?? { row, out: 0, in: 0 }
    if (row.amount < 0) entry.out += 1
    else entry.in += 1
    found.set(key, entry)
  }
  const groupsById = new Map(ledger.groups.map((group) => [group.id, group]))
  return [...found.entries()]
    .sort((a, b) => b[1].out + b[1].in - (a[1].out + a[1].in))
    .map(([key, { row, out, in: inCount }]) => {
      const type = inCount > out ? 'income' : 'expense'
      const candidates = ledger.categories.filter(
        (category) =>
          !category.archived &&
          nameKey(category.name) === nameKey(row.category) &&
          (category.kind === type || category.kind === 'any'),
      )
      // Two of the same name: the one in the group the file names.
      const existing =
        candidates.find(
          (category) =>
            nameKey(groupsById.get(category.groupId)?.name ?? '') === nameKey(row.group),
        ) ?? candidates[0]
      const existingGroup = ledger.groups.find(
        (group) => row.group !== '' && nameKey(group.name) === nameKey(row.group),
      )
      const target: CategoryTarget = existing
        ? { kind: 'existing', id: existing.id }
        : {
            kind: 'new',
            name: row.category,
            group: existingGroup
              ? { kind: 'existing', id: existingGroup.id }
              : { kind: 'new', name: row.group },
          }
      return { key, name: row.category, group: row.group, type, rows: out + inCount, target }
    })
}

/** The state of each row in the review. */
export type RowStatus =
  | { kind: 'ready' }
  | { kind: 'unreadable'; problem: NonNullable<ImportRow['problem']> | 'currency' }
  /** IMP-20: matches a transaction that came from an import or a recurring one. */
  | { kind: 'duplicate'; matchId: string }
  /** IMP-21: matches one the person logged; merged without asking. */
  | { kind: 'merge'; matchId: string }
  /** IMP-22: the other side of `pairLine`, in another wallet. */
  | { kind: 'transfer'; pairLine: number; outgoing: boolean; likely: boolean }
  /** IMP-31: no category from the file, a rule or history. */
  | { kind: 'noCategory' }

export interface PlannedRow {
  row: ImportRow
  walletKey: string
  status: RowStatus
  /** IMP-23: the category from the file, or from what this payee had before. */
  categoryKey: string | null
  suggestedCategoryId: string | null
}

const transferWords =
  /transfer|traspaso|moving funds|movimiento entre|pago tarjeta|credit card payment|pago tdc/

/** How far apart two sides of the same money can be dated (IMP-20, IMP-22). */
const matchDays = 3

export function planRows(
  rows: readonly ImportRow[],
  ledger: PlanLedger,
  wallets: readonly WalletLink[],
  walletCurrency: (link: WalletLink) => string,
): PlannedRow[] {
  const walletOf = new Map(wallets.map((link) => [nameKey(link.name), link]))
  const payeesByKey = new Map(ledger.payees.map((payee) => [nameKey(payee.name), payee]))
  const used = new Set<string>()

  const planned: PlannedRow[] = rows.map((row) => {
    const walletKey = nameKey(row.wallet)
    const link = walletOf.get(walletKey)
    const categoryKey = row.category === '' ? null : linkKey(row)
    let suggestedCategoryId: string | null = null
    if (categoryKey === null && row.payee !== '') {
      const payee = payeesByKey.get(nameKey(row.payee))
      suggestedCategoryId =
        (payee && payeeMemory(ledger.transactions, payee.id)?.categoryId) ?? null
    }
    const base = { row, walletKey, categoryKey, suggestedCategoryId }
    if (row.problem) return { ...base, status: { kind: 'unreadable', problem: row.problem } }
    if (link && row.currency !== walletCurrency(link))
      return { ...base, status: { kind: 'unreadable', problem: 'currency' } }
    // IMP-20, IMP-21: the closest unmatched transaction in the same wallet with the
    // same amount, within three days.
    if (link?.target.kind === 'existing') {
      const walletId = link.target.id
      let best: Transaction | null = null
      let bestGap = Number.MAX_SAFE_INTEGER
      for (const transaction of ledger.transactions) {
        if (used.has(transaction.id) || transaction.kind === 'openingBalance') continue
        if (changeTo(transaction, walletId) !== row.amount) continue
        const gap = Math.abs(daysBetween(transaction.date, row.date ?? transaction.date))
        if (gap <= matchDays && gap < bestGap) {
          best = transaction
          bestGap = gap
        }
      }
      if (best) {
        used.add(best.id)
        const byHand =
          (best.source === undefined || best.source === 'manual' || best.source === 'quickAdd') &&
          (best.kind === 'expense' || best.kind === 'income')
        return {
          ...base,
          status: byHand
            ? { kind: 'merge', matchId: best.id }
            : { kind: 'duplicate', matchId: best.id },
        }
      }
    }
    const hasCategory = categoryKey !== null || suggestedCategoryId !== null
    return {
      ...base,
      status: hasCategory || row.transfer ? { kind: 'ready' } : { kind: 'noCategory' },
    }
  })

  // IMP-22: money out of one wallet in the file and the same amount into another
  // within three days is probably one transfer. It is offered as a transfer by default
  // when the file says so (a type column or a transfer-like category).
  const open = planned.filter(
    (item) => item.status.kind === 'ready' || item.status.kind === 'noCategory',
  )
  const taken = new Set<number>()
  for (const out of open) {
    const amount = out.row.amount ?? 0
    if (amount >= 0 || taken.has(out.row.line)) continue
    let best: PlannedRow | null = null
    let bestGap = Number.MAX_SAFE_INTEGER
    for (const into of open) {
      if (taken.has(into.row.line) || into.walletKey === out.walletKey) continue
      if (into.row.amount !== -amount || into.row.currency !== out.row.currency) continue
      const gap = Math.abs(daysBetween(out.row.date ?? '', into.row.date ?? ''))
      if (gap <= matchDays && gap < bestGap) {
        best = into
        bestGap = gap
      }
    }
    if (!best) continue
    taken.add(out.row.line)
    taken.add(best.row.line)
    const likely =
      out.row.transfer ||
      best.row.transfer ||
      transferWords.test(nameKey(out.row.category)) ||
      transferWords.test(nameKey(best.row.category))
    out.status = { kind: 'transfer', pairLine: best.row.line, outgoing: true, likely }
    best.status = { kind: 'transfer', pairLine: out.row.line, outgoing: false, likely }
  }
  // A row the file calls a transfer with no other side is put to the person.
  for (const item of planned)
    if (item.status.kind === 'ready' && item.row.transfer && item.categoryKey === null)
      item.status = { kind: 'noCategory' }
  return planned
}

export interface PlanSummary {
  ready: number
  merged: number
  flagged: number
  spent: number
  earned: number
  from: string | null
  to: string | null
}

export function summarize(planned: readonly PlannedRow[]): PlanSummary {
  let ready = 0
  let merged = 0
  let flagged = 0
  let spent = 0
  let earned = 0
  let from: string | null = null
  let to: string | null = null
  for (const { row, status } of planned) {
    if (status.kind === 'ready') {
      ready += 1
      const amount = row.amount ?? 0
      if (amount < 0) spent -= amount
      else earned += amount
      const date = row.date ?? ''
      if (from === null || date < from) from = date
      if (to === null || date > to) to = date
    } else if (status.kind === 'merge') merged += 1
    else flagged += 1
  }
  return { ready, merged, flagged, spent, earned, from, to }
}
