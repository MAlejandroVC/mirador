import { ChartPieSliceIcon, HouseIcon, type Icon, ListBulletsIcon, WalletIcon } from '../ui/icons'

// DL-PAT-01: the four places, in this order, in the tab bar and the sidebar alike
// (DL-LAY-06). Tabs are places, never actions (DL-LAY-01); quick-add sits beside them.
export const places = [
  { to: '/', label: 'nav.home', icon: HouseIcon },
  { to: '/activity', label: 'nav.activity', icon: ListBulletsIcon },
  { to: '/budget', label: 'nav.budget', icon: ChartPieSliceIcon },
  { to: '/wallets', label: 'nav.wallets', icon: WalletIcon },
] as const satisfies readonly { to: string; label: string; icon: Icon }[]

export type PlacePath = (typeof places)[number]['to']

/** DL-PAT-01: tapping the place you're already on takes you back to its top. */
export function scrollToTop() {
  // jsdom and very old browsers have no matchMedia; jump straight there in that case.
  const reduce =
    !('matchMedia' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
}
