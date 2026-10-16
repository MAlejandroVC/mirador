import { createContext, useContext } from 'react'

export interface Undoable {
  message: string
  undo: () => void
  /** How long it stays: 5 seconds (DL-CMP-13), longer where the spec asks (TXN-13). */
  seconds?: number
}

export const UndoContext = createContext<((undoable: Undoable) => void) | null>(null)

/** DL-CMP-13: offers to undo a delete for 5 seconds, or `seconds`. */
export function useUndo() {
  const show = useContext(UndoContext)
  if (!show) throw new Error('useUndo must be used inside <UndoProvider>')
  return show
}
