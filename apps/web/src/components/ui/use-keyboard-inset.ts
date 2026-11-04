import { type RefObject, useEffect } from 'react'

/**
 * DL-CMP-08: on a phone, a sheet sits right above the on-screen keyboard. iOS Safari
 * doesn't shrink the page for the keyboard: it slides the visible part of the page up
 * instead, which carried a sheet pinned to the bottom up under the status bar (#305).
 * While the dialog is open, this keeps two variables on it from the visual viewport:
 * `--keyboard-inset`, how much of the page the keyboard covers below what is visible,
 * and `--visible-height`, the height left above it. The sheet's classes use them for
 * its bottom margin and its maximum height.
 */
export function useKeyboardInset(ref: RefObject<HTMLDialogElement | null>, open: boolean) {
  useEffect(() => {
    const dialog = ref.current
    const viewport = window.visualViewport
    if (!open || !dialog || !viewport) return
    const update = () => {
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      dialog.style.setProperty('--keyboard-inset', `${String(Math.round(covered))}px`)
      dialog.style.setProperty('--visible-height', `${String(Math.round(viewport.height))}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      dialog.style.removeProperty('--keyboard-inset')
      dialog.style.removeProperty('--visible-height')
    }
  }, [ref, open])
}
