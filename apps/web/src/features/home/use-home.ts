import { type HomeCard, homeCards } from '@repo/api'
import {
  type Attention,
  attention,
  budgeted,
  type CategoryChange,
  type Coming,
  comingTotals,
  comingUp,
  elapsedDays,
  type MonthGlance,
  monthGlance,
  netWorthHistory,
  type NetWorthPoint,
  newestFirst,
  nextToPlan,
  periodOf,
  type SpendingEntry,
  spreadInstallments,
  type Transaction,
  type Usual,
  usualSpending,
  whatChanged,
} from '@repo/core'
import { useMemo } from 'react'
import { flagThreshold } from '../analysis/use-words'
import { type Budget, useBudget } from '../budget/use-budget'

// Epic 7: everything Home shows, worked out once per change from the budget and the
// records, all in the browser (SEC-01).

/** DSH-09: the steps of Get started, in their order. */
export type SetupStep = 'wallets' | 'history' | 'categories' | 'budget' | 'goal'
export const setupSteps: readonly SetupStep[] = [
  'wallets',
  'history',
  'categories',
  'budget',
  'goal',
]

export interface Home {
  budget: Budget
  /** DSH-01: this month against its budget, once it has one (BUD-70). */
  glance: MonthGlance | null
  /** DSH-01: spending so far against the usual month, while the month has no budget. */
  usual: Usual
  attention: Attention[]
  /** The Uncategorized category, which the list of transactions to categorize opens on. */
  uncategorizedId: string | null
  coming: Coming[]
  totals: { out: number; in: number }
  /** DSH-04: net worth at the end of each of the last months, today's last. */
  worth: NetWorthPoint[]
  highlights: CategoryChange[]
  /** DSH-06: the newest transactions, up to 10. */
  latest: SpendingEntry<Transaction>[]
  /** DSH-09: each step and whether it is done, until all of them are. */
  setup: { step: SetupStep; done: boolean }[] | null
  /** DSH-10: the cards in the person's order, without those they hid. */
  cards: HomeCard[]
}

/** DSH-10: the cards in the person's order; cards added later join at the end. */
export function cardOrder(saved: { order: HomeCard[]; hidden: HomeCard[] } | undefined) {
  const order = [
    ...(saved?.order ?? []).filter((card) => homeCards.includes(card)),
    ...homeCards.filter((card) => !saved?.order.includes(card)),
  ]
  return { order, hidden: new Set(saved?.hidden ?? []) }
}

export function buildHome(budget: Budget): Home {
  const { ledger, today, view, lookups } = budget
  const wallets = new Set(ledger.wallets.map((wallet) => wallet.id))
  const transactions = ledger.transactions.filter((transaction) =>
    wallets.has(transaction.walletId),
  )
  const has = budgeted(budget.current)

  // CAT-05: what still shows as Uncategorized this year.
  const year = periodOf(today, 'year')
  const uncategorized = transactions.filter(
    (transaction) =>
      (transaction.kind === 'expense' || transaction.kind === 'income') &&
      transaction.date >= year.start &&
      transaction.date <= today &&
      lookups.categoryOf(transaction)?.systemKey === 'uncategorized',
  )
  const uncategorizedId =
    ledger.categories.find((category) => category.systemKey === 'uncategorized')?.id ?? null

  const items = attention({
    today,
    wallets: ledger.wallets,
    transactions,
    recurrings: ledger.recurring,
    month: has ? budget.month : null,
    review: budget.review,
    // BUD-70: a month gets a budget only once the person makes one; with history to
    // start from, Home offers it.
    budget: !has && budget.ready ? view.period.start : null,
    next: has ? nextToPlan(ledger.months, view.period, today, budget.settings.startDay) : null,
    uncategorized: uncategorized.length,
    waiting: ledger.batches.reduce((sum, batch) => sum + batch.waiting.length, 0),
  })

  const coming = comingUp({
    today,
    wallets: ledger.wallets,
    transactions,
    recurrings: ledger.recurring,
  })

  // ANA-12, ANA-30: the categories that moved most against their usual month, once a
  // week of it has gone by, so a few days' noise isn't news.
  const counted = budget.entries.filter((entry) => !entry.excluded)
  const highlights =
    elapsedDays(view.period, today) < 7
      ? []
      : whatChanged(counted, view, flagThreshold)
          .filter(
            (item) =>
              item.usual > 0 &&
              item.ratio !== null &&
              (item.flagged || item.ratio < -flagThreshold),
          )
          .slice(0, 3)

  const setup: Home['setup'] = setupSteps.map((step) => ({
    step,
    done:
      step === 'wallets'
        ? ledger.wallets.length > 0
        : step === 'history'
          ? ledger.batches.length > 0 ||
            transactions.some((transaction) => transaction.date < view.period.start)
          : step === 'categories'
            ? ledger.preferences?.categoriesReviewedOn !== undefined
            : step === 'budget'
              ? ledger.months.some((month) => month.lockedAt !== undefined)
              : ledger.goals.length > 0,
  }))

  const { order, hidden } = cardOrder(ledger.preferences?.home)
  return {
    budget,
    glance: has ? monthGlance(budget.month, today) : null,
    usual: usualSpending(counted, view),
    attention: items,
    uncategorizedId,
    coming,
    totals: comingTotals(coming, budget.context),
    worth: netWorthHistory(ledger.wallets, transactions, budget.context, today, 6),
    highlights,
    latest: newestFirst(
      spreadInstallments(transactions).filter((transaction) => transaction.date <= today),
    ).slice(0, 10),
    setup: setup.every((item) => item.done) ? null : setup,
    cards: order.filter((card) => !hidden.has(card)),
  }
}

/** Home, or null while the records load. */
export function useHome(): Home | null {
  const budget = useBudget()
  return useMemo(() => (budget ? buildHome(budget) : null), [budget])
}
