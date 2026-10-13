import { useRouteContext } from '@tanstack/react-router'

// The worker that holds the keys, shared through the router's context.
export function useVault() {
  return useRouteContext({ from: '__root__', select: (context) => context.vault })
}
