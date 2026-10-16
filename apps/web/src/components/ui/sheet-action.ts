import { createContext } from 'react'

/** Where a sheet's main action goes: the round check at the top right of its bar. */
export const SheetActionSlot = createContext<HTMLElement | null>(null)

// DL-CMP-08: a round button in a sheet's bar, as in iOS: a plain `fill` circle for
// closing, a `brand` one for the main action. 44 px to tap (DL-A11Y-05).
export const roundButton =
  'grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
