import type { QueryClient } from '@tanstack/react-query'
import { createRouter, type RouterHistory } from '@tanstack/react-router'
import { stackDirection, trackHistory } from './components/shell/back'
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
    // DL-MOT-06: screens slide like iOS, through the browser's view transitions: a
    // screen pushed onto the stack slides in, back slides it out, and a tab doesn't
    // move. Where view transitions are missing, the screen just changes.
    defaultViewTransition: {
      types: ({ fromLocation, toLocation }) => {
        const direction = stackDirection(fromLocation, toLocation)
        return direction === 'none' ? false : [direction]
      },
    },
  })
  // The same direction for the stylesheet, which can't read the transition's types in
  // every browser that runs view transitions.
  router.subscribe('onBeforeNavigate', ({ fromLocation, toLocation }) => {
    document.documentElement.dataset.nav = stackDirection(fromLocation, toLocation)
  })
  trackHistory(router)
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
