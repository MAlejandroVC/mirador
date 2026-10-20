import {
  type AnalysisView,
  committed,
  budgetMonthOf,
  lookbackPeriods,
  median,
  type Period,
  periodTotals,
  type SliceBy,
} from '@repo/core'
import type { TransactionsSearch } from '../transactions'
import type { Analysis } from './use-analysis'

// What several analysis screens ask of the same records.

/** The usual lookback (BUD-01: 6 periods) and the period viewed, up to today. */
export function lookbackRange(view: AnalysisView, count = 6): Period {
  const first = lookbackPeriods(view, count)[0]
  return {
    start: first?.start ?? view.period.start,
    end: view.period.end < view.today ? view.period.end : view.today,
  }
}

/** This month, as the view that monthly figures (what's coming, projections) start from. */
export function monthView(analysis: Analysis): AnalysisView {
  return {
    ...analysis.view,
    period: budgetMonthOf(analysis.today, analysis.view.monthStart),
    scope: 'month',
  }
}

/**
 * ANA-27, ANA-03: what is committed in this month and the next `count - 1`, for the
 * wallets, category groups and categories the filter keeps.
 */
export function committedFor(analysis: Analysis, count = 12) {
  const { ledger, wallets, state, lookups } = analysis
  const filter = state.filter
  const keepWallet = (id: string) =>
    wallets.has(id) && (!filter.walletIds?.length || filter.walletIds.includes(id))
  const keepCategory = (id: string | null) => {
    if (filter.categoryIds?.length && (id === null || !filter.categoryIds.includes(id)))
      return false
    if (filter.groupIds?.length) {
      const category = id === null ? undefined : lookups.categories.get(id)
      if (!category || !filter.groupIds.includes(category.groupId)) return false
    }
    return true
  }
  const included = filter.budget !== 'included'
  const months = committed(
    ledger.transactions.filter(
      (transaction) =>
        keepWallet(transaction.walletId) && (included || !transaction.excludeFromBudget),
    ),
    ledger.recurring.filter((recurring) => keepWallet(recurring.walletId)),
    analysis.context,
    analysis.today,
    count,
  )
  return months.map((month) => {
    const items = month.items.filter((item) => keepCategory(item.categoryId))
    const sum = (source: 'installment' | 'recurring') =>
      items.filter((item) => item.source === source).reduce((total, item) => total + item.amount, 0)
    return {
      ...month,
      items,
      installments: sum('installment'),
      recurring: sum('recurring'),
      total: sum('installment') + sum('recurring'),
    }
  })
}

/** ANA-40: the usual amount left over in a month, the median of the last 6. */
export function usualLeftOver(analysis: Analysis): number | null {
  return median(
    lookbackPeriods(monthView(analysis), 6).map(
      (period) => periodTotals(analysis.entries, period).leftOver,
    ),
  )
}

/** ANA-04: the transaction list for a period, filtered to one slice. */
export function drillDown(
  period: Period,
  scope: AnalysisView['scope'],
  slice?: { by: SliceBy; id: string },
): TransactionsSearch {
  return { date: period.start, scope, ...(slice ? { [slice.by]: slice.id } : {}) }
}
