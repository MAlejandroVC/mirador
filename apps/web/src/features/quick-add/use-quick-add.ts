import { createContext, useContext } from 'react'

// WID epic: quick-add opens from the button beside the tab bar (DL-LAY-02), the sidebar's
// New button and, later, the dashboard (DSH-06), so the open state lives above them all.
// IMP-41: it also opens on a receipt picture, read as if it had been chosen in it.
export const QuickAddContext = createContext<{
  open: () => void
  openWith: (picture: File) => void
} | null>(null)

export function useQuickAdd() {
  const context = useContext(QuickAddContext)
  if (!context) throw new Error('useQuickAdd must be used inside <QuickAddProvider>')
  return context
}
