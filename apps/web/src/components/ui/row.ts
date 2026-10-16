import { useState } from 'react'
import { isNew } from '../../lib/motion'

// DL-CMP-07: what every list row shares: a tappable row at least 52 px tall.
export const rowClass =
  'flex min-h-[3.25rem] w-full items-center gap-3 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand'

/**
 * DL-MOT-02: a row for something that was just saved opens into its list with a
 * highlight that fades. `id` is what the save marked (lib/motion markNew).
 */
export function useRowClass(id: string | undefined) {
  const [fresh] = useState(() => id !== undefined && isNew(id))
  return fresh ? 'group row-new' : 'group'
}
