import { createFileRoute } from '@tanstack/react-router'
import { LineScreen } from '../../../../features/budget/line-screen'

export const Route = createFileRoute('/_app/budget/line/$line')({
  // BUD-57, BUD-70: the month the line is shown for, by its first day; this month when
  // left out.
  validateSearch: (search: Record<string, unknown>): { month?: string } =>
    typeof search.month === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(search.month)
      ? { month: search.month }
      : {},
  component: Line,
})

function Line() {
  const { line } = Route.useParams()
  const { month } = Route.useSearch()
  return <LineScreen line={line} {...(month ? { month } : {})} />
}
