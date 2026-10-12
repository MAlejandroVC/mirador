import type { QueryClient } from '@tanstack/react-query'
import { createRouter, type RouterHistory } from '@tanstack/react-router'
import type { VaultClient } from './lib/vault'
import { routeTree } from './routeTree.gen'

export function createAppRouter(
  queryClient: QueryClient,
  vault: VaultClient,
  history?: RouterHistory,
) {
  return createRouter({
    routeTree,
    context: { queryClient, vault },
    ...(history ? { history } : {}),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
