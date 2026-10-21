import { elapsedDays, periodDays } from './analysis.ts'
import { daysLeft, type PlanMonth } from './budget.ts'
import { addDays, daysBetween, type Period } from './dates.ts'
import { cardStatement, type SpendingEntry, spreadInstallments } from './installments.ts'
import { occurrenceFields, type Recurring, upcoming } from './recurring.ts'
import { amountIn, type Transaction } from './transactions.ts'
import { dueFees, type Fee, nextFeeDate } from './wallet-features.ts'
import type { Wallet } from './wallets.ts'
import type { ExchangeRate } from './exchange.ts'

// Epic 7: what Home works out from the records, all in the browser (SEC-01). Pure
// functions; the caller passes "today". Needs attention holds what needs a tap from
// the person, Coming up what happens on its own (DSH-05, DSH-11).

/** DSH-05: a card payment needs attention this many days before it is due. */
export const cardDueDays = 7
/** DSH-05: a wallet's balance is worth checking again after this many days. */
export const checkDays = 30
/** DSH-11: how far ahead Coming up looks. */
export const comingDays = 14

/** DSH-01: this month at a glance, for a month with a budget. */
export interface MonthGlance {
  /** What is left to spend; negative when over. */
  left: number
  /** What is left, spread over the days left, today included; null once nothing is left. */
  perDay: number | null
  daysLeft: number
  /** BUD-42: the target minus where spending is heading; negative when heading over. */
  finish: number
  /** Spent over the target, from 0. */
  spentShare: number
  /** BUD-78: where an even pace through the month would be today, from 0 to 1. */
  todayShare: number
}

export function monthGlance(
  month: Pick<PlanMonth, 'period' | 'target' | 'spent' | 'left' | 'projected'>,
  today: string,
): MonthGlance {
  const days = daysLeft(month.period, today)
  return {
    left: month.left,
    perDay: month.left > 0 && days > 0 ? Math.floor(month.left / days) : null,
    daysLeft: days,
    finish: month.target - month.projected,
    spentShare: month.target > 0 ? month.spent / month.target : month.spent > 0 ? 1 : 0,
    todayShare: elapsedDays(month.period, today) / periodDays(month.period),
  }
}

/** DSH-05, WAL-25: a card's statement balance to pay, and when. */
export interface CardDue {
  walletId: string
  /** Minor units in the wallet's currency, positive. */
  amount: number
  due: string
}

/** A credit card with its limit and statement days set up (WAL-16). */
function cards<W extends Wallet>(wallets: readonly W[]) {
  return wallets.flatMap((wallet) =>
    wallet.active && wallet.features.includes('creditLimit') && wallet.credit
      ? [{ wallet, credit: wallet.credit }]
      : [],
  )
}

/**
 * DSH-05: each card whose statement balance is due within `days`, or was due and
 * is still unpaid, soonest first.
 */
export function cardsDue(
  wallets: readonly Wallet[],
  transactions: readonly Transaction[],
  today: string,
  days = cardDueDays,
): CardDue[] {
  const last = addDays(today, days)
  return cards(wallets)
    .map(({ wallet, credit }) => {
      const card = cardStatement(wallet.id, transactions, credit, today)
      return { walletId: wallet.id, amount: card.statement, due: card.due }
    })
    .filter((card) => card.amount > 0 && card.due <= last)
    .sort((a, b) => a.due.localeCompare(b.due))
}

// WAL-05, WAL-07, WAL-18: the transactions that mean the person typed the balance.
const typedKinds = new Set<Transaction['kind']>(['openingBalance', 'adjustment', 'valuation'])

/**
 * DSH-05, WAL-07: when the person last told Mirador what a wallet holds: the last
 * time they checked it, even when it matched, or the latest balance they typed.
 */
export function lastChecked(
  wallet: Pick<Wallet, 'id' | 'checkedOn'>,
  transactions: readonly Pick<Transaction, 'walletId' | 'kind' | 'date'>[],
): string | null {
  let last = wallet.checkedOn ?? null
  for (const transaction of transactions)
    if (
      transaction.walletId === wallet.id &&
      typedKinds.has(transaction.kind) &&
      (last === null || transaction.date > last)
    )
      last = transaction.date
  return last
}

export interface BalanceCheck {
  walletId: string
  since: string
}

/** DSH-05: the active wallets not checked for more than `days`, longest first. */
export function balancesToCheck(
  wallets: readonly Wallet[],
  transactions: readonly Pick<Transaction, 'walletId' | 'kind' | 'date'>[],
  today: string,
  days = checkDays,
): BalanceCheck[] {
  const checks: BalanceCheck[] = []
  for (const wallet of wallets) {
    if (!wallet.active) continue
    const since = lastChecked(wallet, transactions)
    if (since !== null && daysBetween(since, today) > days)
      checks.push({ walletId: wallet.id, since })
  }
  return checks.sort((a, b) => a.since.localeCompare(b.since))
}

/** DSH-05: one thing that needs a tap from the person. */
export type Attention =
  | ({ kind: 'card' } & CardDue)
  /** BUD-43, BUD-45: a line over its target, or heading there by the month's end. */
  | { kind: 'over' | 'atRisk'; line: string; amount: number; end: string }
  /** TXN-10: recurring transactions that came due and wait to be checked. */
  | { kind: 'confirm'; items: { recurring: Recurring; date: string }[] }
  /** WAL-15: a fee that came due, to confirm or skip. */
  | { kind: 'fee'; walletId: string; fee: Fee; date: string }
  /** BUD-50: the month just ended, waiting for its review. */
  | { kind: 'review'; period: Period }
  /** BUD-70: this month has no budget yet. */
  | { kind: 'budget'; start: string }
  /** BUD-71: next month starts soon without a budget locked in. */
  | { kind: 'nextBudget'; start: string; days: number }
  /** CAT-05: transactions still Uncategorized. */
  | { kind: 'categorize'; count: number }
  /** IMP-33: import rows left for later. */
  | { kind: 'imports'; count: number }
  | { kind: 'balance'; checks: BalanceCheck[] }

export interface AttentionInput {
  today: string
  wallets: readonly Wallet[]
  transactions: readonly Transaction[]
  recurrings: readonly Recurring[]
  /** This month against its budget, only when it has one. */
  month: Pick<PlanMonth, 'period' | 'lines'> | null
  review: Period | null
  /** The month to make a budget for, when this one has none and there is history. */
  budget: string | null
  next: { start: string; days: number } | null
  uncategorized: number
  waiting: number
}

/**
 * DSH-05: everything that needs the person, most urgent first: money due, then the
 * budget's lines, then what waits to be checked, then housekeeping.
 */
export function attention(input: AttentionInput): Attention[] {
  const { today, wallets } = input
  const items: Attention[] = cardsDue(wallets, input.transactions, today).map((card) => ({
    kind: 'card',
    ...card,
  }))

  // BUD-43, BUD-45: Commitments land on their date, so only Needs and Wants can be
  // over or heading over. A month that ended is for its review instead.
  const month = input.month
  if (month && today <= month.period.end) {
    const lines = month.lines.filter((line) => line.flexibility !== 'locked')
    const over = lines
      .filter((line) => line.status === 'over')
      .map((line) => ({ line: line.key, amount: -line.left }))
    const risk = lines
      .filter((line) => line.status === 'atRisk')
      .map((line) => ({ line: line.key, amount: line.projected - line.target }))
    for (const line of over.sort((a, b) => b.amount - a.amount))
      items.push({ kind: 'over', ...line, end: month.period.end })
    for (const line of risk.sort((a, b) => b.amount - a.amount))
      items.push({ kind: 'atRisk', ...line, end: month.period.end })
  }

  // TXN-10, WAL-15: what came due and waits for the person to check it.
  const kept = new Set(wallets.map((wallet) => wallet.id))
  const due = upcoming(
    input.recurrings.filter((recurring) => kept.has(recurring.walletId)),
    today,
    today,
  ).filter((item) => item.due)
  if (due.length > 0)
    items.push({
      kind: 'confirm',
      items: due.map((item) => ({ recurring: item.recurring, date: item.date })),
    })
  for (const wallet of wallets) {
    if (!wallet.features.includes('fees') || !wallet.fees) continue
    for (const item of dueFees(wallet.fees, today))
      items.push({ kind: 'fee', walletId: wallet.id, fee: item.fee, date: item.date })
  }

  if (input.review) items.push({ kind: 'review', period: input.review })
  if (input.budget !== null) items.push({ kind: 'budget', start: input.budget })
  if (input.uncategorized > 0) items.push({ kind: 'categorize', count: input.uncategorized })
  if (input.waiting > 0) items.push({ kind: 'imports', count: input.waiting })
  if (input.next) items.push({ kind: 'nextBudget', ...input.next })
  const checks = balancesToCheck(wallets, input.transactions, today)
  if (checks.length > 0) items.push({ kind: 'balance', checks })
  return items
}

/** DSH-11: one thing coming up on its own. */
export type Coming =
  | { kind: 'recurring'; date: string; recurring: Recurring }
  /** TXN-32: an installment of a purchase, as spending counts it. */
  | { kind: 'installment'; date: string; part: SpendingEntry<Transaction> }
  | { kind: 'fee'; date: string; walletId: string; fee: Fee }
  /** WAL-25: a card's statement due after the attention list's days. */
  | ({ kind: 'card' } & CardDue & { date: string })

const comingOrder: Record<Coming['kind'], number> = {
  card: 0,
  recurring: 1,
  installment: 2,
  fee: 3,
}

/**
 * DSH-11: what happens on its own after today and up to `days` ahead, soonest first:
 * recurring transactions that don't ask first, installments, fees, and card payments
 * not yet close enough to need attention.
 */
export function comingUp(input: {
  today: string
  wallets: readonly Wallet[]
  transactions: readonly Transaction[]
  recurrings: readonly Recurring[]
  days?: number
}): Coming[] {
  const { today, wallets } = input
  const end = addDays(today, input.days ?? comingDays)
  const kept = new Set(wallets.map((wallet) => wallet.id))
  const items: Coming[] = []
  for (const item of upcoming(
    input.recurrings.filter((recurring) => kept.has(recurring.walletId)),
    today,
    end,
  ))
    if (!item.due) items.push({ kind: 'recurring', date: item.date, recurring: item.recurring })
  for (const part of spreadInstallments(
    input.transactions.filter((transaction) => transaction.installments),
  ))
    if (part.part && part.date > today && part.date <= end && kept.has(part.walletId))
      items.push({ kind: 'installment', date: part.date, part })
  for (const wallet of wallets) {
    if (!wallet.active || !wallet.features.includes('fees') || !wallet.fees) continue
    for (const fee of wallet.fees) {
      const date = nextFeeDate(fee, today)
      if (date > today && date <= end) items.push({ kind: 'fee', date, walletId: wallet.id, fee })
    }
  }
  const soon = addDays(today, cardDueDays)
  for (const { wallet, credit } of cards(wallets)) {
    const card = cardStatement(wallet.id, input.transactions, credit, today)
    if (card.statement > 0 && card.due > soon && card.due <= end)
      items.push({
        kind: 'card',
        walletId: wallet.id,
        amount: card.statement,
        due: card.due,
        date: card.due,
      })
  }
  return items.sort(
    (a, b) => a.date.localeCompare(b.date) || comingOrder[a.kind] - comingOrder[b.kind],
  )
}

/**
 * DSH-11: what Coming up takes out and brings in, in the default currency. A card
 * payment or any other transfer only moves money between the person's own wallets, so
 * it counts in neither. Amounts in a currency with no rate are left out (TXN-24).
 */
export function comingTotals(
  items: readonly Coming[],
  context: {
    walletCurrency: ReadonlyMap<string, string>
    currency: string
    rates: readonly ExchangeRate[]
  },
): { out: number; in: number } {
  let out = 0
  let incoming = 0
  const add = (amount: number | null) => {
    if (amount === null) return
    if (amount < 0) out -= amount
    else incoming += amount
  }
  const convert = (fields: Parameters<typeof amountIn>[0]) =>
    amountIn(fields, context.walletCurrency, context.currency, context.rates)
  for (const item of items)
    switch (item.kind) {
      case 'recurring':
        if (item.recurring.kind !== 'transfer')
          add(convert(occurrenceFields(item.recurring, item.date, item.date)))
        break
      case 'installment':
        add(convert(item.part))
        break
      case 'fee':
        add(
          convert({
            kind: 'fee',
            walletId: item.walletId,
            date: item.date,
            amount: -item.fee.amount,
          }),
        )
        break
      case 'card':
        break
    }
  return { out, in: incoming }
}
