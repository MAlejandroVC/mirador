import { type QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { VaultClient } from '../lib/vault'

export interface RouterContext {
  queryClient: QueryClient
  vault: VaultClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <Outlet />
    </div>
  )
}
