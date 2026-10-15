import type { QueryClient } from '@tanstack/react-query'
import { createRouter, type RouterHistory } from '@tanstack/react-router'
import { navDirection } from './lib/navigation'
import type { VaultClient } from './lib/vault'
import { routeTree } from './routeTree.gen'

export function createAppRouter(
  queryClient: QueryClient,
  vault: VaultClient,
  history?: RouterHistory,
) {
  const router = createRouter({
    routeTree,
    context: { queryClient, vault },
    ...(history ? { history } : {}),
    // DL-MOT-06: screens slide like iOS, through the browser's view transitions. Where
    // those are missing, the screen just changes.
    defaultViewTransition: {
      types: ({ fromLocation, toLocation }) => {
        const direction = navDirection(fromLocation?.pathname, toLocation.pathname)
        return direction === 'none' ? false : [direction]
      },
    },
  })
  // The same direction for the stylesheet, which can't read the transition's types in
  // every browser that runs view transitions.
  router.subscribe('onBeforeNavigate', ({ fromLocation, toLocation }) => {
    document.documentElement.dataset.nav = navDirection(fromLocation?.pathname, toLocation.pathname)
  })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
