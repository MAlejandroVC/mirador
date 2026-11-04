import { activeFilters, type PeriodScope, type TransactionFilter, toCalendarDate } from '@repo/core'
import { useSyncExternalStore } from 'react'

// ANA-02, ANA-03: the period and filters the Budget tab's analysis shows. They are
// shared by every analysis screen and kept while the app is open, so going into a
// question and back keeps what the person chose. Only the device holds them.

export interface AnalysisState {
  /** A date in the period shown. */
  anchor: string
  scope: PeriodScope
  /** The filter sheet's value; `budget: 'included'` leaves out what the budget does. */
  filter: TransactionFilter
}

const fresh = (): AnalysisState => ({
  anchor: toCalendarDate(new Date()),
  scope: 'month',
  filter: { budget: 'included' },
})

let state = fresh()
const listeners = new Set<() => void>()

export function setAnalysisState(patch: Partial<AnalysisState>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

/** Back to this month and no filters, as after signing in again. */
export function resetAnalysisState() {
  setAnalysisState(fresh())
}

export function useAnalysisState(): AnalysisState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => state,
  )
}

/**
 * ANA-03: how many analysis filters are on, for the Filter button's badge. Counting
 * what is left out of the budget is the one that is on when `budget` is not set.
 */
export function analysisFilters(filter: TransactionFilter): number {
  return activeFilters(filter) - (filter.budget === 'included' ? 1 : 0) + (filter.budget ? 0 : 1)
}
