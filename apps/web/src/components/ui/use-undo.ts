import { createContext, useContext } from 'react'

export interface Undoable {
  message: string
  undo: () => void
}

export const UndoContext = createContext<((undoable: Undoable) => void) | null>(null)

/** DL-CMP-13: offers to undo a delete for 5 seconds. */
export function useUndo() {
  const show = useContext(UndoContext)
  if (!show) throw new Error('useUndo must be used inside <UndoProvider>')
  return show
}
