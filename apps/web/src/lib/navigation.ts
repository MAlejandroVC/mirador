// DL-MOT-06, DL-PAT-01: which way a screen change moves. Going deeper within a tab, or
// into Settings, slides the new screen in from the right; going back out reverses it.
// Switching tabs, signing in and the like don't move at all, as in iOS.
export type NavDirection = 'forward' | 'back' | 'none'

const parts = (path: string) => path.split('/').filter(Boolean)

export function navDirection(from: string | undefined, to: string): NavDirection {
  if (from === undefined || from === to) return 'none'
  const before = parts(from)
  const after = parts(to)
  const inSettings = (segments: string[]) => segments[0] === 'settings'
  if (inSettings(before) !== inSettings(after)) return inSettings(after) ? 'forward' : 'back'
  if (before[0] !== after[0]) return 'none'
  if (after.length > before.length) return 'forward'
  if (after.length < before.length) return 'back'
  return 'none'
}
