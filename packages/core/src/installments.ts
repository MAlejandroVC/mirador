import { addDays, addMonths, nextDayOfMonth, previousDayOfMonth } from './dates.ts'
import { changeTo, type Transaction, type TransactionFields } from './transactions.ts'
import type { CreditSettings } from './wallet-features.ts'

// TXN-30 to TXN-33, WAL-25: purchases a credit card bills in monthly installments
// ("meses sin intereses" in Mexico). The whole amount comes off the balance and the
// available credit on the purchase date, like any expense (TXN-32); the card bills it
// one part per statement, and spending counts it one part per month.

/**
 * TXN-30: each installment of `amount` (signed, like the purchase): equal parts in
 * whole minor units, the last one taking what rounding leaves.
 */
export function installmentShares(amount: number, months: number): number[] {
  const share = Math.trunc(amount / months)
  return Array.from({ length: months }, (_, index) =>
    index === months - 1 ? amount - share * (months - 1) : share,
  )
}

/** Which installments of a plan an entry stands for: `number` to `last`, of `of`. */
export interface InstallmentPart {
  number: number
  last: number
  of: number
  /** The purchase it comes from, which opens when the entry is tapped. */
  purchaseId: string
}

export type SpendingEntry<T extends Transaction> = T & { part?: InstallmentPart }

/**
 * TXN-32: the transactions as spending counts them. A purchase in installments becomes
 * one entry a month from its date (later when the first one is deferred), each with
 * its share; what was left when it was paid off early is one entry on that date
 * (TXN-33). Everything else stays as it is.
 */
export function spreadInstallments<T extends Transaction>(
  transactions: readonly T[],
): SpendingEntry<T>[] {
  const spread: SpendingEntry<T>[] = []
  for (const transaction of transactions) {
    const plan = transaction.installments
    if (!plan) {
      spread.push(transaction)
      continue
    }
    const shares = installmentShares(transaction.amount, plan.months)
    const paidOff =
      plan.paidOff === undefined
        ? null
        : plan.paidOff < transaction.date
          ? transaction.date
          : plan.paidOff
    for (const [index, share] of shares.entries()) {
      const date = addMonths(transaction.date, index + (plan.deferred ?? 0))
      const part = {
        number: index + 1,
        last: index + 1,
        of: plan.months,
        purchaseId: transaction.id,
      }
      if (paidOff !== null && date > paidOff) {
        // Everything from here on was billed on the day it was paid off.
        const rest = shares.slice(index).reduce((sum, amount) => sum + amount, 0)
        spread.push({
          ...transaction,
          id: `${transaction.id}#${String(index + 1)}`,
          date: paidOff,
          amount: rest,
          part: { ...part, last: plan.months },
        })
        break
      }
      spread.push({
        ...transaction,
        id: `${transaction.id}#${String(index + 1)}`,
        date,
        amount: share,
        part,
      })
    }
  }
  return spread
}

/**
 * WAL-25: the day the card bills each installment: the statement that closes on or
 * after the purchase, then one a month (later when deferred). What was still to come
 * when the plan was paid off is billed that day (TXN-33).
 */
export function billingDates(transaction: TransactionFields, closingDay: number): string[] {
  const plan = transaction.installments
  if (!plan) return []
  const paidOff =
    plan.paidOff === undefined
      ? null
      : plan.paidOff < transaction.date
        ? transaction.date
        : plan.paidOff
  return plannedDates(transaction, closingDay).map((billed) =>
    paidOff !== null && billed > paidOff ? paidOff : billed,
  )
}

/** The statement days a plan was set up to be billed on, before any payoff. */
function plannedDates(transaction: TransactionFields, closingDay: number): string[] {
  const plan = transaction.installments
  if (!plan) return []
  const first = nextDayOfMonth(transaction.date, closingDay)
  return Array.from({ length: plan.months }, (_, index) =>
    addMonths(first, index + (plan.deferred ?? 0), closingDay),
  )
}

/** WAL-25: what a credit card owes, split the way its statement does, in minor units. */
export interface CardStatement {
  /** Everything owed, installments to come included. */
  owed: number
  /** The last statement minus the payments since: paying it by `due` avoids interest. */
  statement: number
  /** Charges since the last statement, which go on the next one. */
  since: number
  /** Installments not billed yet. */
  unbilled: number
  /** What can still be spent; negative when over the limit. */
  available: number
  /** The day the last statement closed, and when it is due. */
  lastClosing: string
  due: string
  nextClosing: string
}

/**
 * WAL-25: a credit card's balance split into the statement balance, the charges since
 * and the installments still to come, from its transactions up to `today`.
 */
export function cardStatement(
  walletId: string,
  transactions: readonly TransactionFields[],
  credit: CreditSettings,
  today: string,
): CardStatement {
  const lastClosing = previousDayOfMonth(today, credit.closingDay)
  let owed = 0
  let owedAtClosing = 0
  let payments = 0
  let unbilled = 0
  let unbilledAtClosing = 0
  // Installments billed early by a payoff since the statement, which its payment covers.
  let paidOffSince = 0
  for (const transaction of transactions) {
    if (transaction.date > today) continue
    const change = changeTo(transaction, walletId)
    owed -= change
    if (transaction.date <= lastClosing) owedAtClosing -= change
    else if (change > 0) payments += change
    if (transaction.walletId !== walletId || !transaction.installments) continue
    const shares = installmentShares(-transaction.amount, transaction.installments.months)
    const dates = billingDates(transaction, credit.closingDay)
    const planned = plannedDates(transaction, credit.closingDay)
    for (const [index, share] of shares.entries()) {
      const billed = dates[index] ?? today
      if (billed > today) unbilled += share
      if (transaction.date <= lastClosing && billed > lastClosing) unbilledAtClosing += share
      if (billed > lastClosing && billed !== planned[index]) paidOffSince += share
    }
  }
  const current = Math.max(0, owed - unbilled)
  const statement = Math.min(
    current,
    Math.max(0, owedAtClosing - unbilledAtClosing - payments + paidOffSince),
  )
  return {
    owed,
    statement,
    since: current - statement,
    unbilled,
    available: credit.limit - Math.max(0, owed),
    lastClosing,
    due: nextDayOfMonth(addDays(lastClosing, 1), credit.dueDay),
    nextClosing: nextDayOfMonth(today, credit.closingDay),
  }
}

/** WAL-25: one installment plan on a card and how far along it is. */
export interface PlanProgress<T extends Transaction = Transaction> {
  purchase: T
  /** Installments billed so far, of `months`. */
  billed: number
  months: number
  /** The first installment, positive; the last may differ by rounding. */
  monthly: number
  /** What is still to be billed, positive. */
  left: number
  /** TXN-31: the interest the plan adds, positive, or 0. */
  interest: number
}

/** WAL-25: the card's installment plans with something still to be billed, newest first. */
export function activePlans<T extends Transaction>(
  walletId: string,
  transactions: readonly T[],
  closingDay: number,
  today: string,
): PlanProgress<T>[] {
  const plans: PlanProgress<T>[] = []
  for (const purchase of transactions) {
    const plan = purchase.installments
    if (purchase.walletId !== walletId || !plan || purchase.date > today) continue
    const shares = installmentShares(-purchase.amount, plan.months)
    const dates = billingDates(purchase, closingDay)
    const billed = dates.filter((date) => date <= today).length
    const left = shares.slice(billed).reduce((sum, share) => sum + share, 0)
    if (left <= 0) continue
    plans.push({
      purchase,
      billed,
      months: plan.months,
      monthly: shares[0] ?? 0,
      left,
      interest: plan.price === undefined ? 0 : -purchase.amount - plan.price,
    })
  }
  return plans.sort((a, b) => (a.purchase.date < b.purchase.date ? 1 : -1))
}
