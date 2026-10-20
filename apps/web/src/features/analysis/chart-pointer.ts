import { type ReactNode, useEffect, useRef, useState } from 'react'

// DL-VIZ-05: a chart shows the values at one point in a callout above it. On a computer
// it follows the mouse; on a phone the person touches and holds the chart, then drags
// along it, as in Apple's Stocks, and lifting the finger hides it. A tap is left alone,
// so a column that opens a month still opens it at once, and a swipe still scrolls.

/** How long a finger rests on the chart before the callout shows: a touch and hold. */
const holdMs = 350
/** How far a finger may drift while holding; any further is a scroll. */
const slop = 6

/**
 * Which point of a chart is being looked at. `pick` turns a spot on the chart, in page
 * coordinates, into a point's index, or null where there is none. `show` is for
 * keyboard focus, which shows the focused point's callout too; `attach` goes on the
 * chart's element as its `ref`.
 */
export function useChartPointer<T extends HTMLElement = HTMLDivElement>(
  pick: (x: number, y: number, box: DOMRect) => number | null,
) {
  // A state, not a ref, so a chart that appears later still gets its listeners.
  const [node, attach] = useState<T | null>(null)
  const picker = useRef(pick)
  useEffect(() => {
    picker.current = pick
  })
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    if (!node) return
    const at = (x: number, y: number) => picker.current(x, y, node.getBoundingClientRect())
    let timer: number | undefined
    let start: { x: number; y: number } | null = null
    let last = { x: 0, y: 0 }
    let held = false

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') setActive(at(event.clientX, event.clientY))
    }
    const onPointerLeave = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') setActive(null)
    }
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      window.clearTimeout(timer)
      if (event.touches.length !== 1 || !touch) {
        start = null
        return
      }
      start = { x: touch.clientX, y: touch.clientY }
      last = start
      timer = window.setTimeout(() => {
        held = true
        setActive(at(last.x, last.y))
      }, holdMs)
    }
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      if (held) {
        // While holding, the finger moves along the chart instead of the page.
        if (event.cancelable) event.preventDefault()
        setActive(at(touch.clientX, touch.clientY))
        return
      }
      last = { x: touch.clientX, y: touch.clientY }
      if (start && Math.hypot(last.x - start.x, last.y - start.y) > slop) {
        window.clearTimeout(timer)
        start = null
      }
    }
    const onTouchEnd = (event: TouchEvent) => {
      window.clearTimeout(timer)
      start = null
      if (!held) return
      // Lifting the finger off a held chart is not a tap: no column opens.
      if (event.cancelable) event.preventDefault()
      held = false
      setActive(null)
    }
    // A long press would otherwise open the system menu (Android) or select text.
    const onContextMenu = (event: Event) => {
      if (held || start) event.preventDefault()
    }

    node.addEventListener('pointermove', onPointerMove)
    node.addEventListener('pointerleave', onPointerLeave)
    node.addEventListener('touchstart', onTouchStart, { passive: true })
    node.addEventListener('touchmove', onTouchMove, { passive: false })
    node.addEventListener('touchend', onTouchEnd)
    node.addEventListener('touchcancel', onTouchEnd)
    node.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.clearTimeout(timer)
      node.removeEventListener('pointermove', onPointerMove)
      node.removeEventListener('pointerleave', onPointerLeave)
      node.removeEventListener('touchstart', onTouchStart)
      node.removeEventListener('touchmove', onTouchMove)
      node.removeEventListener('touchend', onTouchEnd)
      node.removeEventListener('touchcancel', onTouchEnd)
      node.removeEventListener('contextmenu', onContextMenu)
    }
  }, [node])

  return { attach, active, show: setActive }
}

/** The index of the point nearest `x` on a line drawn edge to edge over `count` points. */
export function nearestPoint(x: number, box: DOMRect, count: number): number | null {
  if (count <= 0 || box.width <= 0) return null
  const fraction = Math.min(1, Math.max(0, (x - box.left) / box.width))
  return count === 1 ? 0 : Math.round(fraction * (count - 1))
}

/**
 * The index of the column under `x`, for `count` columns of equal width; a finger
 * dragged past either end stays on the first or last one.
 */
export function columnAt(x: number, box: DOMRect, count: number): number | null {
  if (count <= 0 || box.width <= 0) return null
  const fraction = Math.min(1, Math.max(0, (x - box.left) / box.width))
  return Math.min(count - 1, Math.floor(fraction * count))
}

/** What a callout says: a date or a name, then each series' amount. */
export interface Tip {
  title: string
  rows: readonly TipRow[]
}

/** A callout with one amount. */
export const amountTip = (title: string, amount: string): Tip => ({
  title,
  rows: [{ key: 'amount', value: amount }],
})

/** Keeps a finger's touch and hold on the chart from selecting text or scrolling sideways. */
export const holdable = 'touch-pan-y select-none [-webkit-touch-callout:none]'

/** One line of a callout: a series' amount, with its key when there is more than one. */
export interface TipRow {
  key: string
  value: string
  label?: string
  /** The series' key, drawn as in the chart's legend. */
  mark?: ReactNode
}
