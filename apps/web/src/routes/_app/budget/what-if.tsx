import { createFileRoute } from '@tanstack/react-router'
import { WhatIfScreen } from '../../../features/budget/what-if-screen'

export const Route = createFileRoute('/_app/budget/what-if')({
  // BUD-35: `gap` opens with the cuts that close the gap; `id` opens a saved what-if.
  validateSearch: (search: Record<string, unknown>): { gap?: true; id?: string } => ({
    ...(search.gap === true || search.gap === 'true' ? { gap: true as const } : {}),
    ...(typeof search.id === 'string' ? { id: search.id } : {}),
  }),
  component: WhatIf,
})

function WhatIf() {
  const { gap, id } = Route.useSearch()
  return <WhatIfScreen {...(gap ? { gap } : {})} {...(id ? { id } : {})} />
}
