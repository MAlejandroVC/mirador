import { createFileRoute } from '@tanstack/react-router'
import { BudgetScreen, type BudgetSearch } from '../../../features/analysis'

export const Route = createFileRoute('/_app/budget/')({
  // The Plan | Spending switch and the month shown, kept in the address so back returns
  // to the same side and month. Budget opens on Plan, on this month.
  validateSearch: (search: Record<string, unknown>): BudgetSearch => ({
    ...(search.view === 'spending' ? { view: 'spending' as const } : {}),
    ...(typeof search.month === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(search.month)
      ? { month: search.month }
      : {}),
    ...(search.edit === true ? { edit: true as const } : {}),
    ...(search.find === true ? { find: true as const } : {}),
  }),
  component: Budget,
})

function Budget() {
  const search = Route.useSearch()
  return <BudgetScreen search={search} />
}
