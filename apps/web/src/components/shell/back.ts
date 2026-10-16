import {
  type NavigateOptions,
  type RegisteredRouter,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'

// The app's page at each place in this tab's history, as TanStack Router numbers
// them, so a back button knows whether the page before is one of ours.
const visited = new Map<number, string>()

function placeOf(state: unknown) {
  const index = (state as { __TSR_index?: unknown } | null)?.__TSR_index
  return typeof index === 'number' ? index : null
}

/** Records each page of the signed-in app as the router reaches it. */
export function trackHistory(router: RegisteredRouter) {
  visited.clear()
  router.subscribe('onResolved', () => {
    const place = placeOf(router.history.location.state)
    if (place === null) return
    // Sign-in, unlock and recovery are not pages to go back to.
    if (router.state.matches.some((match) => match.routeId === '/_app'))
      visited.set(place, router.history.location.pathname)
    else visited.delete(place)
  })
}

/**
 * DL-CMP-06: a round back button returns to the page it came from, like iOS's
 * navigation stack, so going back twice never lands on the page just left. Opened
 * from a link, after a reload or from outside the app, there is no page before:
 * it goes to `fallback` instead, in place of this page.
 */
export function useBack(label: string, fallback: NavigateOptions) {
  const router = useRouter()
  const navigate = useNavigate()
  return {
    label,
    onClick: () => {
      const place = placeOf(router.history.location.state)
      if (place !== null && visited.has(place - 1)) router.history.back()
      else void navigate({ ...fallback, replace: true } as NavigateOptions)
    },
  }
}
