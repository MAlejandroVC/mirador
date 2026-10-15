import { type QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { AutoLock } from '../features/security'
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
    <div className="min-h-dvh bg-background text-text">
      <AutoLock />
      <Outlet />
    </div>
  )
}
