import {
  type AnalysisContext,
  type AnalysisEntry,
  type AnalysisFilter,
  type AnalysisView,
  analysisEntries,
  filterEntries,
  periodOf,
  toCalendarDate,
  type TransactionFilter,
} from '@repo/core'
import { useMemo } from 'react'
import { type Taxonomy, taxonomy } from '../categories/lookups'
import { type Ledger, type LedgerWallet, useLedger } from '../wallets/use-ledger'
import { type AnalysisState, useAnalysisState } from './analysis-state'

/** Everything an analysis screen works from, computed once per change. */
export interface Analysis {
  ledger: Ledger
  lookups: Taxonomy
  wallets: ReadonlyMap<string, LedgerWallet>
  context: AnalysisContext
  today: string
  view: AnalysisView
  /** Every entry, before the filters. */
  all: AnalysisEntry[]
  /** ANA-03: the entries that pass the filters, which every figure counts. */
  entries: AnalysisEntry[]
  state: AnalysisState
}

/** ANA-03: the filter sheet's value as analysis reads it. */
export function analysisFilter(filter: TransactionFilter): AnalysisFilter {
  return {
    ...(filter.walletIds ? { walletIds: filter.walletIds } : {}),
    ...(filter.groupIds ? { groupIds: filter.groupIds } : {}),
    ...(filter.categoryIds ? { categoryIds: filter.categoryIds } : {}),
    ...(filter.tagIds ? { tagIds: filter.tagIds } : {}),
    ...(filter.payeeIds ? { payeeIds: filter.payeeIds } : {}),
    includeExcluded: filter.budget !== 'included',
  }
}

export function buildAnalysis(ledger: Ledger, state: AnalysisState, today: string): Analysis {
  const wallets = new Map(ledger.wallets.map((wallet) => [wallet.id, wallet]))
  // A transaction whose wallet is gone has nowhere to count (WAL-08 deletes them too).
  const kept = ledger.transactions.filter((transaction) => wallets.has(transaction.walletId))
  const context: AnalysisContext = {
    walletCurrency: new Map(ledger.wallets.map((wallet) => [wallet.id, wallet.currency])),
    currency: ledger.defaultCurrency,
    rates: ledger.rates,
    categories: ledger.categories,
  }
  // Analysis looks back, never ahead: installments and dates still to come wait for
  // their day (What's coming shows them, ANA-27).
  const all = analysisEntries(kept, context).filter((entry) => entry.date <= today)
  // SYS-02: a month runs from the day budget months start on.
  const monthStart = ledger.preferences?.budget?.startDay ?? 1
  return {
    ledger,
    lookups: taxonomy(ledger),
    wallets,
    context,
    today,
    view: {
      period: periodOf(state.anchor, state.scope, 0, monthStart),
      scope: state.scope,
      firstDay: 0,
      monthStart,
      today,
      firstDate: all[0]?.date ?? null,
    },
    all,
    entries: filterEntries(all, analysisFilter(state.filter)),
    state,
  }
}

/** The analysis for the period and filters chosen, or null while the records load. */
export function useAnalysis(): Analysis | null {
  const { data: ledger } = useLedger()
  const state = useAnalysisState()
  const today = toCalendarDate(new Date())
  return useMemo(
    () => (ledger ? buildAnalysis(ledger, state, today) : null),
    [ledger, state, today],
  )
}
