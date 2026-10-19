import type { SliceBy } from '@repo/core'
import { createFileRoute } from '@tanstack/react-router'
import { WhereScreen } from '../../../features/analysis'

const slices: readonly string[] = ['group', 'category', 'tag', 'payee', 'wallet']

export const Route = createFileRoute('/_app/budget/where')({
  // Which split shows, kept in the address so back returns to it.
  validateSearch: (search: Record<string, unknown>): { by?: SliceBy } =>
    typeof search.by === 'string' && slices.includes(search.by) ? { by: search.by as SliceBy } : {},
  component: Where,
})

function Where() {
  const { by } = Route.useSearch()
  return <WhereScreen by={by ?? 'group'} />
}
