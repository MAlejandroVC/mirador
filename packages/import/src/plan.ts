import {
  addMonths,
  type Category,
  type CategoryGroup,
  changeTo,
  daysBetween,
  installmentShares,
  type Payee,
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
  /** IMP-09: a wallet with a credit limit takes payments as transfers into it. */
  features?: readonly string[]
  active?: boolean
}

export interface PlanLedger {
  wallets: readonly PlanWallet[]
  groups: readonly CategoryGroup[]
  categories: readonly Category[]
  payees: readonly Payee[]
  transactions: readonly Transaction[]
  /** Where a payment most likely came from when nothing says otherwise. */
  defaultWalletId?: string | null
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
  /** IMP-10: read from a picture or scan, with a date or amount to check first. */
  | { kind: 'check'; fields: NonNullable<ImportRow['unsure']> }
  /** IMP-28: a month of an installment purchase already in the wallet; skipped. */
  | { kind: 'installment'; planId: string; month: number; months: number }
  /** IMP-28: the first sight of a purchase in installments; comes in as one. */
  | { kind: 'plan'; month: number; months: number }

export interface PlannedRow {
  row: ImportRow
  walletKey: string
  status: RowStatus
  /** IMP-23: the category from the file, or from what this payee had before. */
  categoryKey: string | null
  suggestedCategoryId: string | null
  /**
   * IMP-09, IMP-40: a transfer with another of the person's wallets: money in comes
   * from it, money out goes to it. `guessed` when the app chose it, so it is shown.
   */
  transfer?: { walletId: string; guessed: boolean }
}

const transferWords =
  /transfer|traspaso|moving funds|movimiento entre|pago tarjeta|credit card payment|pago tdc/

/** How far apart two sides of the same money can be dated (IMP-20, IMP-22). */
const matchDays = 3

// IMP-09: on a card, money in that reads like a payment is one, not income.
const paymentWords = /\b(?:pago|pagos|su pago|abono|payment|autopay)\b/

export function planRows(
  rows: readonly ImportRow[],
  ledger: PlanLedger,
  wallets: readonly WalletLink[],
  walletCurrency: (link: WalletLink) => string,
): PlannedRow[] {
  const walletOf = new Map(wallets.map((link) => [nameKey(link.name), link]))
  const used = new Set<string>()
  const suggest = categorySuggester(ledger)
  const paidFrom = new Map<string, string | null>()

  const planned: PlannedRow[] = rows.map((row) => {
    const walletKey = nameKey(row.wallet)
    const link = walletOf.get(walletKey)
    const categoryKey = row.category === '' ? null : linkKey(row)
    const walletId = link?.target.kind === 'existing' ? link.target.id : null
    // IMP-09: a payment into a wallet with a credit limit is a transfer from another.
    let transfer: PlannedRow['transfer']
    if (typeof row.transferWith === 'string')
      transfer = { walletId: row.transferWith, guessed: false }
    else if (
      row.transferWith === undefined &&
      walletId !== null &&
      row.amount !== null &&
      row.amount > 0 &&
      (row.payment === true || paymentWords.test(nameKey(row.payee)))
    ) {
      const wallet = ledger.wallets.find((item) => item.id === walletId)
      if (wallet?.features?.includes('creditLimit')) {
        if (!paidFrom.has(walletId)) paidFrom.set(walletId, payingWallet(ledger, wallet))
        const from = paidFrom.get(walletId)
        if (from) transfer = { walletId: from, guessed: true }
      }
    }
    const suggestedCategoryId =
      categoryKey === null && !transfer && row.amount !== null
        ? suggest(row.payee, row.amount)
        : null
    const base = {
      row,
      walletKey,
      categoryKey,
      suggestedCategoryId,
      ...(transfer ? { transfer } : {}),
    }
    // IMP-10: a date or amount the picture made unreadable is for the person to fill in.
    const unsureProblem =
      (row.problem === 'date' || row.problem === 'amount') && row.unsure?.includes(row.problem)
    if (row.problem && !unsureProblem)
      return { ...base, status: { kind: 'unreadable', problem: row.problem } }
    if (link && row.currency !== walletCurrency(link))
      return { ...base, status: { kind: 'unreadable', problem: 'currency' } }
    // Matching on an amount or date that may be misread could skip a real row.
    if (row.unsure && row.unsure.length > 0)
      return { ...base, status: { kind: 'check', fields: row.unsure } }
    // IMP-20, IMP-21: the closest unmatched transaction in the same wallet with the
    // same amount, within three days.
    // IMP-28: a month of a plan matches the purchase it belongs to, by its share and
    // the month it should be billed (statements bill a few weeks after the date).
    const mark = row.installment
    if (mark && row.amount !== null && row.amount < 0) {
      const amount = row.amount
      const walletId = link?.target.kind === 'existing' ? link.target.id : null
      const plan = ledger.transactions.find(
        (transaction) =>
          walletId !== null &&
          !used.has(transaction.id) &&
          transaction.walletId === walletId &&
          transaction.installments?.months === mark.months &&
          installmentShares(transaction.amount, mark.months).some(
            (share) => Math.abs(share - amount) <= 1,
          ) &&
          Math.abs(
            daysBetween(
              addMonths(
                transaction.date,
                mark.month - 1 + (transaction.installments.deferred ?? 0),
              ),
              row.date ?? transaction.date,
            ),
          ) <= 45,
      )
      if (plan) {
        used.add(plan.id)
        return { ...base, status: { kind: 'installment', planId: plan.id, ...mark } }
      }
      return { ...base, status: { kind: 'plan', ...mark } }
    }
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
      status: hasCategory || row.transfer || transfer ? { kind: 'ready' } : { kind: 'noCategory' },
    }
  })

  // IMP-22: money out of one wallet in the file and the same amount into another
  // within three days is probably one transfer. It is offered as a transfer by default
  // when the file says so (a type column or a transfer-like category).
  const open = planned.filter(
    (item) => !item.transfer && (item.status.kind === 'ready' || item.status.kind === 'noCategory'),
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
  for (const { row, status, transfer } of planned) {
    if (status.kind === 'ready') {
      ready += 1
      // A transfer is neither spent nor earned (TXN-03).
      const amount = transfer ? 0 : (row.amount ?? 0)
      if (amount < 0) spent -= amount
      else earned += amount
      const date = row.date ?? ''
      if (from === null || date < from) from = date
      if (to === null || date > to) to = date
    } else if (status.kind === 'merge' || status.kind === 'installment') merged += 1
    else flagged += 1
  }
  return { ready, merged, flagged, spent, earned, from, to }
}

/**
 * IMP-09: the wallet a card's payment most likely came from: the one that paid it
 * last time, else the default wallet, else the only other wallet in its currency
 * without a credit limit. None when it can't be told.
 */
function payingWallet(ledger: PlanLedger, card: PlanWallet): string | null {
  const fits = (wallet: PlanWallet | undefined): wallet is PlanWallet =>
    wallet !== undefined &&
    wallet.id !== card.id &&
    wallet.active !== false &&
    wallet.currency === card.currency
  const byId = new Map(ledger.wallets.map((wallet) => [wallet.id, wallet]))
  let last: Transaction | null = null
  for (const transaction of ledger.transactions)
    if (
      transaction.kind === 'transfer' &&
      transaction.toWalletId === card.id &&
      fits(byId.get(transaction.walletId)) &&
      (!last || transaction.date > last.date)
    )
      last = transaction
  if (last) return last.walletId
  const fallback = ledger.defaultWalletId ? byId.get(ledger.defaultWalletId) : undefined
  if (fits(fallback) && !fallback.features?.includes('creditLimit')) return fallback.id
  const others = ledger.wallets.filter(
    (wallet) => fits(wallet) && !wallet.features?.includes('creditLimit'),
  )
  return others.length === 1 ? (others[0]?.id ?? null) : null
}

// Words that say nothing about who was paid: places, company forms, card words.
const fillerWords = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'y',
  'en',
  'the',
  'and',
  'of',
  'sa',
  'cv',
  'sapi',
  'srl',
  'inc',
  'llc',
  'ltd',
  'co',
  'com',
  'www',
  'mx',
  'mex',
  'us',
  'usa',
  'pos',
  'compra',
  'purchase',
  'pago',
  'payment',
])

/** The words of a payee that tell it apart, without numbers, places or filler. */
export function payeeWords(name: string): string[] {
  return nameKey(name)
    .split(' ')
    .filter((word) => word.length >= 3 && !/\d/.test(word) && !fillerWords.has(word))
}

// IMP-23: lines every statement uses for charges with a system category (CAT-05).
const systemWords: [NonNullable<Category['systemKey']>, RegExp, 'expense' | 'income'][] = [
  ['interest', /\b(?:interes|intereses|interest|finance charge)\b/, 'expense'],
  ['fees', /\b(?:comision|comisiones|anualidad|fee|fees|annual fee|late fee|cuota)\b/, 'expense'],
  ['refunds', /\b(?:devolucion|reembolso|bonificacion|refund|reversal|reverso)\b/, 'income'],
]

/**
 * IMP-23: a category for a row from what the person did before: the same payee's last
 * category, else that of the payee whose distinguishing words match best ("OXXO GDL
 * 1234" and "Oxxo"), else a system category for interest, fees and refunds. Only
 * history going the same way counts, so a refund doesn't take a store's expense.
 */
export function categorySuggester(ledger: PlanLedger) {
  const payeeNames = new Map(ledger.payees.map((payee) => [payee.id, payee.name]))
  const categories = new Map(ledger.categories.map((category) => [category.id, category]))
  interface Known {
    key: string
    words: string[]
    categoryId: string
    date: string
  }
  const known = new Map<string, Known>()
  for (const transaction of ledger.transactions) {
    if (transaction.kind !== 'expense' && transaction.kind !== 'income') continue
    if (!transaction.payeeId || !transaction.categoryId) continue
    const category = categories.get(transaction.categoryId)
    if (!category || category.archived || category.systemKey === 'uncategorized') continue
    const name = payeeNames.get(transaction.payeeId)
    if (!name) continue
    const id = `${transaction.kind}:${transaction.payeeId}`
    const before = known.get(id)
    if (before && before.date >= transaction.date) continue
    known.set(id, {
      key: `${transaction.kind}:${nameKey(name)}`,
      words: payeeWords(name),
      categoryId: transaction.categoryId,
      date: transaction.date,
    })
  }
  const byKind = { expense: [] as Known[], income: [] as Known[] }
  for (const [id, entry] of known)
    byKind[id.startsWith('expense') ? 'expense' : 'income'].push(entry)
  const systemIds = new Map(
    ledger.categories.flatMap((category) =>
      category.systemKey && !category.archived ? [[category.systemKey, category.id] as const] : [],
    ),
  )
  const same = (a: string, b: string) =>
    a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)))

  return (payee: string, amount: number): string | null => {
    const kind = amount < 0 ? 'expense' : 'income'
    const key = nameKey(payee)
    const list = byKind[kind]
    const exact = list.find((entry) => entry.key === `${kind}:${key}`)
    if (exact) return exact.categoryId
    const words = payeeWords(payee)
    let best: Known | null = null
    let bestScore = 0
    if (words.length > 0)
      for (const entry of list) {
        if (entry.words.length === 0) continue
        const shared = entry.words.filter((word) => words.some((other) => same(word, other)))
        // Every word of the shorter name, or the first word of both and one more.
        const fewer = Math.min(entry.words.length, words.length)
        const first = same(entry.words[0] ?? '', words[0] ?? '')
        if (shared.length < fewer && !(first && shared.length >= Math.min(2, fewer))) continue
        const score = shared.length * 10 + (first ? 5 : 0)
        if (score > bestScore || (score === bestScore && best && entry.date > best.date)) {
          best = entry
          bestScore = score
        }
      }
    if (best) return best.categoryId
    for (const [systemKey, pattern, direction] of systemWords)
      if (direction === kind && pattern.test(key)) return systemIds.get(systemKey) ?? null
    return null
  }
}
