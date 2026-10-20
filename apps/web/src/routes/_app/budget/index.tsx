import { createFileRoute } from '@tanstack/react-router'
import { BudgetScreen } from '../../../features/analysis'

export const Route = createFileRoute('/_app/budget/')({
  // The Plan | Spending switch, kept in the address so back returns to the same side.
  // Budget opens on Plan.
  validateSearch: (search: Record<string, unknown>): { view?: 'spending' } =>
    search.view === 'spending' ? { view: 'spending' } : {},
  component: Budget,
})

function Budget() {
  const { view } = Route.useSearch()
  return <BudgetScreen view={view ?? 'plan'} />
}
