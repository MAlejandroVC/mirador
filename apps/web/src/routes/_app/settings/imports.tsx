import { createFileRoute } from '@tanstack/react-router'
import { ImportsScreen } from '../../../features/data/imports-screen'

// IMP-42: ?batch= opens one import, and &undo=1 asks right away how to undo it (from
// the banner a statement import shows).
export const Route = createFileRoute('/_app/settings/imports')({
  validateSearch: (search: Record<string, unknown>): { batch?: string; undo?: boolean } => ({
    ...(typeof search.batch === 'string' && /^[0-9a-f-]{36}$/.test(search.batch)
      ? { batch: search.batch }
      : {}),
    ...(search.undo === true || search.undo === '1' || search.undo === 1 ? { undo: true } : {}),
  }),
  component: Imports,
})

function Imports() {
  const { batch, undo } = Route.useSearch()
  return <ImportsScreen {...(batch ? { open: batch } : {})} {...(undo ? { undo } : {})} />
}
