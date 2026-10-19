import {
  type ParsedLocation,
  type RegisteredRouter,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

// DL-CMP-06: screens form a stack, as in iOS. A link inside the app pushes a screen and
// the round back button pops it, so back always returns to where the person was, never
// to a fixed parent. A tab, or a place in the sidebar, starts a new stack: it is a
// change of place, not a step deeper, so its screen has no back button.

declare module '@tanstack/react-router' {
  interface HistoryState {
    /** Set by the tab bar and the sidebar: this screen starts a new stack. */
    root?: true
  }
}

// How deep each history entry is in its stack, by entry key: 0 for a stack's first
// screen, -1 for a page outside the signed-in app (sign-in, unlock). Kept for the tab's
// session, so back still works after a reload.
const storageKey = 'mirador.stack'
const depths = new Map<string, number>()
let last: { key: string; index: number } | null = null

function load() {
  try {
    const saved = JSON.parse(globalThis.sessionStorage.getItem(storageKey) ?? '{}') as Record<
      string,
      number
    >
    for (const [key, depth] of Object.entries(saved)) depths.set(key, depth)
  } catch {
    // Without storage the stack starts over on a reload.
  }
}

function save() {
  try {
    // The latest 200 entries are plenty for any way back.
    const recent = [...depths].slice(-200)
    globalThis.sessionStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(recent)))
  } catch {
    // Keep it in memory only.
  }
}

function entryOf(location: Pick<ParsedLocation, 'state'>) {
  const state = location.state as { __TSR_key?: string; key?: string; __TSR_index?: number }
  const key = state.__TSR_key ?? state.key
  return key === undefined ? null : { key, index: state.__TSR_index ?? 0 }
}

/**
 * The depth of `location` in its stack, worked out the first time it is reached: a
 * push from a screen of the app goes one deeper, a replace keeps the depth, and a tab,
 * a reload with no record or a page reached from outside the app starts at 0.
 */
function depthOf(location: Pick<ParsedLocation, 'state'>, inApp = true) {
  const entry = entryOf(location)
  if (!entry) return 0
  const known = depths.get(entry.key)
  if (known !== undefined) return known
  let depth = 0
  if (!inApp) depth = -1
  else if (location.state.root) depth = 0
  else if (last) {
    const before = depths.get(last.key) ?? -1
    if (entry.index === last.index + 1 && before >= 0) depth = before + 1
    else if (entry.index === last.index) depth = Math.max(before, 0)
  }
  depths.set(entry.key, depth)
  save()
  return depth
}

/** Follows the router so each screen knows how deep it is. */
export function trackHistory(router: RegisteredRouter) {
  depths.clear()
  last = null
  load()
  router.subscribe('onResolved', () => {
    const location = router.state.location
    // Sign-in, unlock and recovery are not screens to go back to.
    const inApp = router.state.matches.some((match) => match.routeId === '/_app')
    depthOf(location, inApp)
    last = entryOf(location)
  })
}

/**
 * DL-CMP-06: the round back button of a screen pushed onto the stack, which pops it.
 * A screen at the start of its stack has none: there is nowhere to go back to.
 */
export function useBack() {
  const { t } = useTranslation()
  const router = useRouter()
  const location = useRouterState({ select: (state) => state.location })
  if (depthOf(location) <= 0) return undefined
  return {
    // It goes wherever the person came from, so it is named for that, not a place.
    label: t('nav.back'),
    onClick: () => {
      router.history.back()
    },
  }
}

/** DL-MOT-06: which way the screen moves, from the stack: deeper slides in, back out. */
export function stackDirection(
  from: Pick<ParsedLocation, 'state' | 'pathname'> | undefined,
  to: Pick<ParsedLocation, 'state' | 'pathname'>,
) {
  if (!from || from.pathname === to.pathname || to.state.root) return 'none' as const
  const before = entryOf(from)
  const after = entryOf(to)
  if (!before || !after) return 'none' as const
  if (after.index > before.index) return 'forward' as const
  if (after.index < before.index) return 'back' as const
  return 'none' as const
}
