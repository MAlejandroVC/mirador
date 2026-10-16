import { addDays, addMonths } from './dates.ts'
import {
  type EntryDraft,
  entryFields,
  type EntryType,
  type Transaction,
  type TransactionFields,
} from './transactions.ts'

// TXN-09, TXN-10: recurring transactions. A template adds the same expense, income or
// transfer on a schedule. Only the device can add them, since the server can't read or
// write what is inside a record (SEC-01), so they are added when the app opens.

export type RepeatUnit = 'day' | 'week' | 'month' | 'year'

export interface Repeat {
  unit: RepeatUnit
  count: number
}

/** TXN-09: the schedules offered first; anything else is custom. */
export const repeatPresets = {
  daily: { unit: 'day', count: 1 },
  weekly: { unit: 'week', count: 1 },
  biweekly: { unit: 'week', count: 2 },
  monthly: { unit: 'month', count: 1 },
  yearly: { unit: 'year', count: 1 },
} as const satisfies Record<string, Repeat>
export type RepeatPreset = keyof typeof repeatPresets

/** The preset a schedule matches, or null for a custom one. */
export function repeatPreset(every: Repeat): RepeatPreset | null {
  for (const [name, preset] of Object.entries(repeatPresets))
    if (preset.unit === every.unit && preset.count === every.count) return name as RepeatPreset
  return null
}

export interface RecurringFields {
  kind: EntryType
  walletId: string
  /** Each one's amount, signed like a transaction's. */
  amount: number
  note?: string
  toWalletId?: string
  toAmount?: number
  rate?: number
  categoryId?: string
  tagIds?: string[]
  payeeId?: string
  excludeFromBudget?: boolean
  start: string
  every: Repeat
  until?: string
  times?: number
  /** TXN-10: wait for the person to check each one. */
  ask?: boolean
  /** The last date added or skipped. */
  handled?: string
  createdAt?: string
  updatedAt?: string
}

export interface Recurring extends RecurringFields {
  id: string
}

// More than enough for a daily one over years; it keeps a bad date from looping long.
const most = 5000

/** The date of the `index`-th time, counting from 0 at the start. */
export function occurrenceAt(recurring: Pick<RecurringFields, 'start' | 'every'>, index: number) {
  const { unit, count } = recurring.every
  switch (unit) {
    case 'day':
      return addDays(recurring.start, index * count)
    case 'week':
      return addDays(recurring.start, index * count * 7)
    case 'month':
      return addMonths(recurring.start, index * count)
    case 'year':
      return addMonths(recurring.start, index * count * 12)
  }
}

/** TXN-09: the dates it falls on from `from` to `to`, both included, until it ends. */
export function occurrences(
  recurring: Pick<RecurringFields, 'start' | 'every' | 'until' | 'times'>,
  from: string,
  to: string,
): string[] {
  const dates: string[] = []
  const last = Math.min(recurring.times ?? most, most)
  for (let index = 0; index < last; index += 1) {
    const date = occurrenceAt(recurring, index)
    if (date > to || (recurring.until !== undefined && date > recurring.until)) break
    if (date >= from) dates.push(date)
  }
  return dates
}

/** The first date after `after` it falls on, or null once it has ended. */
export function nextOccurrence(
  recurring: Pick<RecurringFields, 'start' | 'every' | 'until' | 'times'>,
  after: string,
): string | null {
  const last = Math.min(recurring.times ?? most, most)
  for (let index = 0; index < last; index += 1) {
    const date = occurrenceAt(recurring, index)
    if (recurring.until !== undefined && date > recurring.until) return null
    if (date > after) return date
  }
  return null
}

/** TXN-10: the dates that came due by `today` and were neither added nor skipped. */
export function dueDates(recurring: RecurringFields, today: string): string[] {
  const after = recurring.handled ?? addDays(recurring.start, -1)
  return occurrences(recurring, addDays(after, 1), today)
}

/** How many times it has come up to `date`, included. */
export function timesBy(recurring: RecurringFields, date: string): number {
  return occurrences(recurring, recurring.start, date).length
}

/** TXN-10: the transaction one date of a recurring transaction adds. */
export function occurrenceFields(
  recurring: Recurring,
  date: string,
  now: string,
): TransactionFields {
  return {
    kind: recurring.kind,
    walletId: recurring.walletId,
    date,
    amount: recurring.amount,
    ...(recurring.note !== undefined ? { note: recurring.note } : {}),
    ...(recurring.toWalletId !== undefined ? { toWalletId: recurring.toWalletId } : {}),
    ...(recurring.toAmount !== undefined ? { toAmount: recurring.toAmount } : {}),
    ...(recurring.rate !== undefined ? { rate: recurring.rate } : {}),
    ...(recurring.categoryId !== undefined ? { categoryId: recurring.categoryId } : {}),
    ...(recurring.tagIds !== undefined ? { tagIds: recurring.tagIds } : {}),
    ...(recurring.payeeId !== undefined ? { payeeId: recurring.payeeId } : {}),
    ...(recurring.excludeFromBudget ? { excludeFromBudget: true } : {}),
    source: 'recurring',
    recurringId: recurring.id,
    occurrence: date,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * TXN-10: transactions with one of each date of a recurring transaction. Two devices
 * that open at once may both add the same date; the one made first is kept.
 */
export function withoutRepeatedOccurrences<T extends Transaction>(transactions: readonly T[]): T[] {
  const first = new Map<string, T>()
  for (const transaction of transactions) {
    if (transaction.recurringId === undefined || transaction.occurrence === undefined) continue
    const key = `${transaction.recurringId} ${transaction.occurrence}`
    const kept = first.get(key)
    if (!kept || transaction.id < kept.id) first.set(key, transaction)
  }
  return transactions.filter(
    (transaction) =>
      transaction.recurringId === undefined ||
      transaction.occurrence === undefined ||
      first.get(`${transaction.recurringId} ${transaction.occurrence}`) === transaction,
  )
}

/** One upcoming date of a recurring transaction, for the list (TXN-09). */
export interface Upcoming {
  recurring: Recurring
  date: string
  /** TXN-10: came due and waits for the person to check it. */
  due: boolean
}

/**
 * What is coming from `today` to `end`: the dates still to come, and, for those that
 * ask first, the earliest one that came due and waits. Soonest first.
 */
export function upcoming(recurrings: readonly Recurring[], today: string, end: string): Upcoming[] {
  const items: Upcoming[] = []
  for (const recurring of recurrings) {
    if (recurring.ask) {
      const [waiting] = dueDates(recurring, today)
      if (waiting !== undefined) items.push({ recurring, date: waiting, due: true })
    }
    if (end <= today) continue
    for (const date of occurrences(recurring, addDays(today, 1), end))
      items.push({ recurring, date, due: false })
  }
  return items.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1))
}

/** TXN-09: when it repeats and how it ends, as the form sets them. */
export interface Schedule {
  every: Repeat
  until?: string
  times?: number
  ask?: boolean
}

/**
 * TXN-09: the recurring transaction for a draft, which starts on the draft's date. What
 * was already added or skipped, and when it was made, are kept when it is changed.
 */
export function recurringFields(
  draft: EntryDraft,
  schedule: Schedule,
  now: string,
  kept: Pick<RecurringFields, 'handled' | 'createdAt'> = {},
): RecurringFields {
  const fields = entryFields({ ...draft, installments: undefined }, 'recurring', now)
  return {
    kind: draft.type,
    walletId: fields.walletId,
    amount: fields.amount,
    ...(fields.note !== undefined ? { note: fields.note } : {}),
    ...(fields.toWalletId !== undefined ? { toWalletId: fields.toWalletId } : {}),
    ...(fields.toAmount !== undefined ? { toAmount: fields.toAmount } : {}),
    ...(fields.rate !== undefined ? { rate: fields.rate } : {}),
    ...(fields.categoryId !== undefined ? { categoryId: fields.categoryId } : {}),
    ...(fields.tagIds !== undefined ? { tagIds: fields.tagIds } : {}),
    ...(fields.payeeId !== undefined ? { payeeId: fields.payeeId } : {}),
    ...(fields.excludeFromBudget ? { excludeFromBudget: true } : {}),
    start: draft.date,
    every: schedule.every,
    ...(schedule.until !== undefined ? { until: schedule.until } : {}),
    ...(schedule.times !== undefined ? { times: schedule.times } : {}),
    ...(schedule.ask ? { ask: true } : {}),
    ...(kept.handled !== undefined ? { handled: kept.handled } : {}),
    createdAt: kept.createdAt ?? now,
    updatedAt: now,
  }
}

/** The draft a recurring transaction opens as, to be changed; its date is the start. */
export function recurringDraft(recurring: RecurringFields): EntryDraft {
  return {
    type: recurring.kind,
    amount: Math.abs(recurring.amount),
    walletId: recurring.walletId,
    date: recurring.start,
    ...(recurring.toWalletId !== undefined ? { toWalletId: recurring.toWalletId } : {}),
    ...(recurring.toAmount !== undefined ? { toAmount: recurring.toAmount } : {}),
    ...(recurring.rate !== undefined ? { rate: recurring.rate } : {}),
    ...(recurring.note !== undefined ? { note: recurring.note } : {}),
    ...(recurring.categoryId !== undefined ? { categoryId: recurring.categoryId } : {}),
    ...(recurring.tagIds !== undefined ? { tagIds: recurring.tagIds } : {}),
    ...(recurring.payeeId !== undefined ? { payeeId: recurring.payeeId } : {}),
    ...(recurring.excludeFromBudget ? { excludeFromBudget: true } : {}),
  }
}

/** Whether it has ended by `today`: nothing comes after the last date already passed. */
export function hasEnded(recurring: RecurringFields, today: string): boolean {
  return nextOccurrence(recurring, today) === null
}
