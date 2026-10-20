import { createFileRoute } from '@tanstack/react-router'
import { CompareScreen } from '../../../features/budget/compare-screen'

export const Route = createFileRoute('/_app/budget/compare')({
  // BUD-38: the saved what-ifs to set side by side.
  validateSearch: (search: Record<string, unknown>): { ids?: string[] } =>
    Array.isArray(search.ids)
      ? { ids: search.ids.filter((id): id is string => typeof id === 'string') }
      : {},
  component: Compare,
})

function Compare() {
  const { ids } = Route.useSearch()
  return <CompareScreen ids={ids ?? []} />
}
