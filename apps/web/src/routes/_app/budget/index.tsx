import { createFileRoute } from '@tanstack/react-router'
import { BudgetScreen } from '../../../features/analysis'

export const Route = createFileRoute('/_app/budget/')({
  // The Plan | Spending switch, kept in the address so back returns to the same side.
  validateSearch: (search: Record<string, unknown>): { view?: 'plan' } =>
    search.view === 'plan' ? { view: 'plan' } : {},
  component: Budget,
})

function Budget() {
  const { view } = Route.useSearch()
  return <BudgetScreen view={view ?? 'spending'} />
}
