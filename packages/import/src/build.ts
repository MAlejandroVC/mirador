import {
  categoryGroupRecord,
  categoryGroupRecordType,
  categoryRecord,
  categoryRecordType,
  type ImportBatchRecord,
  importBatchRecord,
  importBatchRecordType,
  payeeRecord,
  payeeRecordType,
  type RecordBody,
  type RecurringRecord,
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
  addMonths,
  changeTo,
  type Category,
  nextTagColor,
  type Tag,
  type Transaction,
} from '@repo/core'
import type { CategoryLink, PlanLedger, PlannedRow, WalletLink, WalletTarget } from './plan.ts'
import { undoSettings } from './updates.ts'
import { nameKey } from './values.ts'

// IMP-34: turning the reviewed rows into records, all tied to one import batch so the
// whole import can be undone (IMP-35). Every record is checked against its schema here,
// before anything is encrypted and saved.

export interface RecordChange {
  id: string
  body: RecordBody
}

export interface Decisions {
  /** IMP-20: probable duplicates the person chose to keep anyway, by line. */
  keep: ReadonlySet<number>
  /** IMP-22: possible transfers the person said are not, by the outgoing line. */
  apart: ReadonlySet<number>
  /** IMP-31: categories picked for rows without one, by line. */
  categories: ReadonlyMap<number, string>
  /** IMP-40: rows the person said aren't transactions, by line. */
  ignore?: ReadonlySet<number>
  /** IMP-28: new installment purchases the person said are plain charges, by line. */
  single?: ReadonlySet<number>
}

/** The defaults: probable duplicates skipped, likely transfers paired. */
export function defaultDecisions(planned: readonly PlannedRow[]): Decisions {
  const apart = new Set<number>()
  for (const { row, status } of planned)
    if (status.kind === 'transfer' && status.outgoing && !status.likely) apart.add(row.line)
  return { keep: new Set(), apart, categories: new Map(), ignore: new Set(), single: new Set() }
}

export interface BuildInput {
  planned: readonly PlannedRow[]
  wallets: readonly WalletLink[]
  categories: readonly CategoryLink[]
  decisions: Decisions
  ledger: PlanLedger & { tags: readonly Tag[] }
  /** CAT-05: where rows with no category end up. */
  uncategorizedId: string
  file: { name: string; fingerprint?: string; source: ImportBatchRecord['source'] }
  /** A new wallet's record, with its preset's look (WAL-23). */
  newWallet: (target: Extract<WalletTarget, { kind: 'new' }>, name: string) => WalletRecord
  /** Names for what the file leaves unnamed. */
  names: { wallet: string; group: string }
  newId: () => string
  now: Date
  /** IMP-39, IMP-29: the wallet changes made with the import, to undo them with it. */
  settings?: ImportBatchRecord['settings']
}

export interface BuildResult {
  batchId: string
  changes: RecordChange[]
  batch: ImportBatchRecord
}

const body = (type: string, data: unknown): RecordBody => ({
  deleted: false,
  type,
  schema: 1,
  data,
})

export function buildImport(input: BuildInput): BuildResult {
  const { ledger, decisions, newId } = input
  const batchId = newId()
  const createdAt = input.now.toISOString()
  const created: RecordChange[] = []
  const transactions: { id: string; data: TransactionRecord }[] = []

  // IMP-01: wallets first, as everything else points at them.
  const walletIds = new Map<string, string>()
  const walletCurrencies = new Map<string, string>()
  const newWallets = new Map<string, WalletLink & { target: { kind: 'new' } }>()
  let order = ledger.wallets.length
  for (const link of input.wallets) {
    const key = nameKey(link.name)
    if (link.target.kind === 'existing') {
      const wallet = ledger.wallets.find((w) => w.id === (link.target as { id: string }).id)
      walletIds.set(key, link.target.id)
      walletCurrencies.set(key, wallet?.currency ?? '')
      continue
    }
    const id = newId()
    const name = link.target.name.trim() || link.name.trim() || input.names.wallet
    const record = walletRecord.parse({ ...input.newWallet(link.target, name), order })
    order += 1
    created.push({ id, body: body(walletRecordType, record) })
    walletIds.set(key, id)
    walletCurrencies.set(key, record.currency)
    newWallets.set(id, link as WalletLink & { target: { kind: 'new' } })
  }

  // Category groups and categories the file names that the person doesn't have.
  const groupIds = new Map<string, string>()
  const groupColors = [...ledger.groups]
  const categoryIds = new Map<string, string>()
  const categoryCount = new Map<string, number>()
  for (const category of ledger.categories)
    categoryCount.set(category.groupId, (categoryCount.get(category.groupId) ?? 0) + 1)
  for (const link of input.categories) {
    if (link.target.kind === 'existing') {
      categoryIds.set(link.key, link.target.id)
      continue
    }
    let groupId: string
    if (link.target.group.kind === 'existing') groupId = link.target.group.id
    else {
      const groupName = link.target.group.name.trim() || input.names.group
      const groupKey = nameKey(groupName)
      const known = groupIds.get(groupKey)
      if (known) groupId = known
      else {
        groupId = newId()
        const color = nextTagColor(groupColors)
        groupColors.push({ id: groupId, name: groupName, color })
        groupIds.set(groupKey, groupId)
        created.push({
          id: groupId,
          body: body(
            categoryGroupRecordType,
            categoryGroupRecord.parse({ name: groupName, color, order: groupColors.length - 1 }),
          ),
        })
      }
    }
    const id = newId()
    const position = categoryCount.get(groupId) ?? 0
    categoryCount.set(groupId, position + 1)
    const fields: Omit<Category, 'id'> = {
      name: link.target.name.trim().slice(0, 60) || link.name.slice(0, 60),
      groupId,
      kind: link.type,
      icon: link.type === 'income' ? 'money' : 'shoppingBag',
      flexibility: link.type === 'income' ? 'fixed' : 'flexible',
      order: position,
    }
    created.push({ id, body: body(categoryRecordType, categoryRecord.parse(fields)) })
    categoryIds.set(link.key, id)
  }

  // Tags and payees by name, made when new.
  const tagIds = new Map(ledger.tags.map((tag) => [nameKey(tag.name), tag.id]))
  const tagColors: Pick<Tag, 'color'>[] = [...ledger.tags]
  const tagOf = (name: string) => {
    const key = nameKey(name)
    const known = tagIds.get(key)
    if (known) return known
    const id = newId()
    const color = nextTagColor(tagColors)
    tagColors.push({ color })
    tagIds.set(key, id)
    created.push({
      id,
      body: body(tagRecordType, tagRecord.parse({ name: name.slice(0, 40), color })),
    })
    return id
  }
  const payeeIds = new Map(ledger.payees.map((payee) => [nameKey(payee.name), payee.id]))
  const payeeOf = (name: string) => {
    const key = nameKey(name)
    if (key === '') return undefined
    const known = payeeIds.get(key)
    if (known) return known
    const id = newId()
    payeeIds.set(key, id)
    created.push({
      id,
      body: body(payeeRecordType, payeeRecord.parse({ name: name.trim().slice(0, 80) })),
    })
    return id
  }

  const byLine = new Map(input.planned.map((item) => [item.row.line, item]))
  const merged: ImportBatchRecord['merged'] = []
  const mergedChanges: RecordChange[] = []
  const waiting: ImportBatchRecord['waiting'] = []
  let skipped = 0

  for (const item of input.planned) {
    const { row, status } = item
    const walletId = walletIds.get(item.walletKey)
    if (status.kind === 'unreadable' || !walletId || row.date === null || row.amount === null) {
      if (status.kind === 'unreadable') {
        const categoryId =
          (item.categoryKey !== null ? categoryIds.get(item.categoryKey) : undefined) ??
          item.suggestedCategoryId ??
          undefined
        const note = row.note || row.payee
        waiting.push({
          line: row.line,
          problem: status.problem,
          text: row.text,
          ...(row.date !== null ? { date: row.date } : {}),
          ...(row.amount !== null && row.amount !== 0 ? { amount: row.amount } : {}),
          ...(walletId ? { walletId } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(note ? { note: note.slice(0, 500) } : {}),
        })
      }
      skipped += 1
      continue
    }
    if (
      (status.kind === 'duplicate' && !decisions.keep.has(row.line)) ||
      status.kind === 'installment' ||
      decisions.ignore?.has(row.line)
    ) {
      skipped += 1
      continue
    }
    if (status.kind === 'merge') {
      // IMP-21: keep what the person entered, take the statement's date.
      const mine = ledger.transactions.find((transaction) => transaction.id === status.matchId)
      if (mine && mine.date !== row.date) {
        merged.push({ id: mine.id, date: mine.date })
        const { id, ...fields } = mine
        mergedChanges.push({
          id,
          body: body(
            transactionRecordType,
            transactionRecord.parse({ ...fields, date: row.date, updatedAt: createdAt }),
          ),
        })
      }
      continue
    }
    const shared = {
      date: row.date,
      ...(row.note ? { note: row.note.slice(0, 500) } : {}),
      ...(row.tags.length > 0 ? { tagIds: [...new Set(row.tags.map(tagOf))] } : {}),
      source: 'import' as const,
      importBatchId: batchId,
      createdAt,
    }
    if (
      status.kind === 'transfer' &&
      !decisions.apart.has(status.outgoing ? row.line : status.pairLine)
    ) {
      // IMP-22: the outgoing side makes the transfer; the incoming one is part of it.
      if (!status.outgoing) continue
      const into = byLine.get(status.pairLine)
      const toWalletId = into && walletIds.get(into.walletKey)
      if (into && toWalletId && into.row.amount !== null) {
        transactions.push({
          id: newId(),
          data: transactionRecord.parse({
            ...shared,
            kind: 'transfer',
            walletId,
            amount: row.amount,
            toWalletId,
            toAmount: into.row.amount,
          }),
        })
        continue
      }
    }
    // IMP-09, IMP-40: a transfer with another of the person's wallets. Money in came
    // from it; money out went to it. Each side is in its own wallet's currency, so a
    // wallet in another currency is never offered.
    const other = item.transfer
      ? ledger.wallets.find((w) => w.id === item.transfer?.walletId)
      : undefined
    if (other && other.id !== walletId) {
      const size = Math.abs(row.amount)
      const into = row.amount > 0
      transactions.push({
        id: newId(),
        data: transactionRecord.parse({
          ...shared,
          // A transfer has no payee, so what the statement called it stays as its note.
          ...(row.note || row.payee ? { note: (row.note || row.payee).slice(0, 500) } : {}),
          kind: 'transfer',
          walletId: into ? other.id : walletId,
          amount: -size,
          toWalletId: into ? walletId : other.id,
          toAmount: size,
        }),
      })
      continue
    }
    const categoryId =
      (item.categoryKey !== null ? categoryIds.get(item.categoryKey) : undefined) ??
      decisions.categories.get(row.line) ??
      item.suggestedCategoryId ??
      input.uncategorizedId
    const payeeId = payeeOf(row.payee)
    // IMP-28, TXN-30: month N of M is a purchase of M times that, made N-1 months ago.
    const plan = status.kind === 'plan' && !decisions.single?.has(row.line) ? status : null
    transactions.push({
      id: newId(),
      data: transactionRecord.parse({
        ...shared,
        kind: row.amount < 0 ? 'expense' : 'income',
        walletId,
        amount: plan ? row.amount * plan.months : row.amount,
        categoryId,
        ...(payeeId ? { payeeId } : {}),
        ...(plan
          ? {
              date: addMonths(row.date, -(plan.month - 1)),
              installments: { months: plan.months },
            }
          : {}),
      }),
    })
  }

  // WAL-05: a new wallet's balance today sets its opening balance, dated with its
  // first transaction, so the history adds up to what the bank shows.
  for (const [walletId, link] of newWallets) {
    if (link.target.balanceToday === null) continue
    const own = transactions.filter(
      ({ data }) => data.walletId === walletId || data.toWalletId === walletId,
    )
    const sum = own.reduce((total, { data }) => total + changeTo(data, walletId), 0)
    const opening = link.target.balanceToday - sum
    if (opening === 0) continue
    const first = own.reduce(
      (earliest, { data }) => (data.date < earliest ? data.date : earliest),
      input.now.toISOString().slice(0, 10),
    )
    transactions.push({
      id: newId(),
      data: transactionRecord.parse({
        kind: 'openingBalance',
        walletId,
        date: first,
        amount: opening,
        source: 'import',
        importBatchId: batchId,
        createdAt,
      }),
    })
  }

  const batch = importBatchRecord.parse({
    source: input.file.source,
    fileName: input.file.name.slice(0, 255),
    ...(input.file.fingerprint ? { fingerprint: input.file.fingerprint } : {}),
    importedAt: createdAt,
    rows: input.planned.length,
    imported: transactions.filter(({ data }) => data.kind !== 'openingBalance').length,
    skipped,
    created: created.map((change) => change.id),
    merged,
    waiting: waiting.slice(0, 2000),
    ...(input.settings ? { settings: input.settings } : {}),
  } satisfies ImportBatchRecord)

  // The batch goes first: if saving stops halfway, undo still finds what was saved.
  return {
    batchId,
    batch,
    changes: [
      { id: batchId, body: body(importBatchRecordType, batch) },
      ...created,
      ...transactions.map(({ id, data }) => ({ id, body: body(transactionRecordType, data) })),
      ...mergedChanges,
    ],
  }
}

export interface UndoLedger {
  transactions: readonly Transaction[]
  categories: readonly Category[]
  /** Recurring transactions, which point at wallets, categories, tags and payees. */
  recurring: readonly {
    walletId: string
    toWalletId?: string
    categoryId?: string
    tagIds?: string[]
    payeeId?: string
  }[]
  /** Every record's type, by id, so deletions say what they delete (SEC-04). */
  typeOf: (id: string) => string | undefined
  /** The wallets and recurring transactions as saved, to put settings back (IMP-42). */
  records?: {
    wallets: readonly (WalletRecord & { id: string })[]
    recurring: readonly (RecurringRecord & { id: string })[]
  }
}

/**
 * IMP-35: undoing an import removes exactly what it added: its transactions, and the
 * wallets, groups, categories, tags and payees it created that nothing else came to
 * use since. Transactions it merged get their own date back.
 */
export function undoImport(
  batchId: string,
  batch: ImportBatchRecord,
  ledger: UndoLedger,
  options: { keepSettings?: boolean } = {},
) {
  const deleted = (id: string, type: string): RecordChange => ({
    id,
    body: { deleted: true, type },
  })
  const removed = ledger.transactions.filter((t) => t.importBatchId === batchId)
  const kept = ledger.transactions.filter((t) => t.importBatchId !== batchId)
  const createdIds = new Set(batch.created)
  const inUse = new Set<string>()
  for (const t of [...kept, ...ledger.recurring]) {
    inUse.add(t.walletId)
    if (t.toWalletId) inUse.add(t.toWalletId)
    if (t.categoryId) inUse.add(t.categoryId)
    if (t.payeeId) inUse.add(t.payeeId)
    for (const tag of t.tagIds ?? []) inUse.add(tag)
  }
  // A group stays while a category not going away is in it.
  const leaving = (id: string) => createdIds.has(id) && !inUse.has(id)
  for (const category of ledger.categories) if (!leaving(category.id)) inUse.add(category.groupId)

  const changes: RecordChange[] = []
  for (const id of batch.created) {
    if (inUse.has(id)) continue
    const type = ledger.typeOf(id)
    if (type) changes.push(deleted(id, type))
  }
  for (const t of removed) changes.push(deleted(t.id, transactionRecordType))
  for (const { id, date } of batch.merged) {
    const mine = kept.find((t) => t.id === id)
    if (!mine) continue
    const { id: _id, ...fields } = mine // eslint-disable-line @typescript-eslint/no-unused-vars
    changes.push({
      id,
      body: body(transactionRecordType, transactionRecord.parse({ ...fields, date })),
    })
  }
  // IMP-42: "Undo everything" also puts back what it changed on the wallet.
  if (batch.settings && !options.keepSettings && ledger.records)
    changes.push(
      ...undoSettings(
        batch.settings,
        ledger.records.wallets.find((wallet) => wallet.id === batch.settings?.walletId),
        ledger.records.recurring,
      ),
    )
  // The batch itself goes last, so an undo that stops halfway can simply be retried.
  changes.push(deleted(batchId, importBatchRecordType))
  return { changes, removed: removed.length, kept: [...createdIds].filter((id) => inUse.has(id)) }
}
