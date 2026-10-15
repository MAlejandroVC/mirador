import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { leave } from '../../lib/motion'

/**
 * A native <dialog> shown as a modal while `open`, for sheets and action sheets. While it
 * leaves (DL-MOT-06) its content stays as it was, so what slides away is what was on
 * screen; once it has closed, the content unmounts and starts fresh next time.
 */
export function useModal<Content>(open: boolean, content: Content) {
  const ref = useRef<HTMLDialogElement>(null)
  const [kept, setKept] = useState<Content | null>(null)
  if (open && kept !== content) setKept(content)

  // Closing because `open` turned false is not the person closing it.
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // showModal focuses the first control, such as Cancel; the field meant to be
      // typed in first takes it instead (React's autoFocus runs before the dialog opens).
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && dialog.open) {
      leave(dialog)
      dialog.close()
    }
  }, [open])

  /**
   * For the dialog's close event. Closed by the person (Escape, say), it tells the
   * screen; closed because `open` turned false, it lets the content go.
   */
  const handleClose = (event: SyntheticEvent<HTMLDialogElement>, onClose: () => void) => {
    // React passes a nested dialog's close event up to this one; only its own counts.
    if (event.target !== event.currentTarget) return
    if (openRef.current) onClose()
    else setKept(null)
  }

  return [ref, open ? content : kept, handleClose] as const
}
