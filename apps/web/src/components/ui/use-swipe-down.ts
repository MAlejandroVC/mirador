import { type RefObject, useEffect, useRef } from 'react'
import { ease, reduceMotion } from '../../lib/motion'

const wide = () => window.matchMedia('(min-width: 768px)').matches

/**
 * DL-CMP-08: on a phone, a sheet follows the finger down and closes when let go far
 * or fast enough, as in iOS. The pull starts from the grabber and title bar at any
 * time, and from the content once it is scrolled to the top. Closing goes through
 * `onClose`, so a sheet with unsaved changes can ask "Discard changes?" first; if it
 * stays open, it springs back into place. A control that is dragged itself, such as
 * a reorder handle, marks itself `data-drag` and keeps its own gesture.
 */
export function useSwipeDown(ref: RefObject<HTMLDialogElement | null>, onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    let start: { x: number; y: number; fromBar: boolean } | null = null
    let dragging = false
    let offset = 0
    // The last few positions, to tell a flick from a slow pull.
    let trail: { y: number; at: number }[] = []

    const place = (y: number) => {
      offset = Math.max(0, y)
      dialog.style.translate = offset ? `0 ${String(offset)}px` : ''
    }
    const springBack = () => {
      const from = offset
      place(0)
      if (from && typeof dialog.animate === 'function' && !reduceMotion())
        dialog.animate([{ translate: `0 ${String(from)}px` }, { translate: '0 0' }], {
          duration: 300,
          easing: ease,
        })
    }

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      const target = event.target as Element | null
      // A sheet opened from this one sits inside it in the page; only its own touches count.
      if (
        event.touches.length !== 1 ||
        !touch ||
        wide() ||
        target?.closest('dialog') !== dialog ||
        target.closest('[data-drag]')
      ) {
        start = null
        return
      }
      start = {
        x: touch.clientX,
        y: touch.clientY,
        fromBar: Boolean(target.closest('[data-sheet-bar]')),
      }
      dragging = false
      trail = [{ y: touch.clientY, at: event.timeStamp }]
    }

    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!start || !touch) return
      const dy = touch.clientY - start.y
      const dx = touch.clientX - start.x
      if (!dragging) {
        // Only a pull that is mostly downward, and only when nothing above is left to
        // scroll back to; anything else is a scroll or a tap.
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return
        if (dy <= 0 || Math.abs(dx) > dy || (!start.fromBar && dialog.scrollTop > 0)) {
          start = null
          return
        }
        dragging = true
      }
      event.preventDefault()
      place(touch.clientY - start.y)
      trail = [
        ...trail.filter((point) => event.timeStamp - point.at < 100),
        {
          y: touch.clientY,
          at: event.timeStamp,
        },
      ]
    }

    const onEnd = () => {
      if (!start || !dragging) {
        start = null
        return
      }
      start = null
      dragging = false
      const first = trail[0]
      const last = trail.at(-1)
      const speed =
        first && last && last.at > first.at ? (last.y - first.y) / (last.at - first.at) : 0
      if (offset > dialog.offsetHeight * 0.25 || (speed > 0.5 && offset > 24)) {
        // The sheet leaves from where the finger let go (lib/motion.ts reads its place).
        close.current()
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (dialog.open) springBack()
          })
        })
      } else {
        springBack()
      }
    }

    const onClosed = () => {
      place(0)
    }

    dialog.addEventListener('touchstart', onStart, { passive: true })
    dialog.addEventListener('touchmove', onMove, { passive: false })
    dialog.addEventListener('touchend', onEnd)
    dialog.addEventListener('touchcancel', onEnd)
    dialog.addEventListener('close', onClosed)
    return () => {
      dialog.removeEventListener('touchstart', onStart)
      dialog.removeEventListener('touchmove', onMove)
      dialog.removeEventListener('touchend', onEnd)
      dialog.removeEventListener('touchcancel', onEnd)
      dialog.removeEventListener('close', onClosed)
    }
  }, [ref])
}
