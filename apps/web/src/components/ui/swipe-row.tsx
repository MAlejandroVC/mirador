import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { reduceMotion } from '../../lib/motion'
import { TrashIcon } from './icons'
import { RowBody, type RowContent } from './list'
import { rowClass, useRowClass } from './row'

// How far a short swipe slides the row: room for the Delete pill (DL-CMP-07).
const pillRoom = 112
// Past this share of the row's width, letting go deletes it straight away.
const longSwipe = 0.5

/**
 * DL-CMP-07: a list row that opens when tapped and is deleted by swiping it to the
 * left, as in iOS. A short swipe leaves a small red Delete pill showing; tapping it
 * deletes the row. A long swipe deletes it at once. Tapping anywhere else closes the
 * pill. Delete must also be offered on the row's own screen (DL-A11Y-07), since a
 * swipe can't be reached from a keyboard or a screen reader.
 */
export function SwipeRow({
  id,
  onClick,
  onDelete,
  deleteLabel,
  ...content
}: RowContent & {
  id?: string
  onClick: () => void
  onDelete: () => void
  deleteLabel: string
}) {
  const className = useRowClass(id)
  const row = useRef<HTMLLIElement>(null)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState(false)
  // Where the finger went down, and whether it is swiping (true), scrolling (false) or
  // not yet clear (null).
  const gesture = useRef<{ x: number; y: number; base: number; swiping: boolean | null } | null>(
    null,
  )
  // A swipe ends with a click on the row; that click must not open it.
  const swiped = useRef(false)
  const open = offset !== 0 && !dragging

  // Tapping anywhere else closes the pill.
  useEffect(() => {
    if (!open) return
    const close = (event: globalThis.PointerEvent) => {
      if (!row.current?.contains(event.target as Node)) setOffset(0)
    }
    document.addEventListener('pointerdown', close, true)
    return () => {
      document.removeEventListener('pointerdown', close, true)
    }
  }, [open])

  function remove() {
    // DL-MOT-07: the row slides off and the list closes over it, then it is deleted.
    setLeaving(true)
    setTimeout(onDelete, reduceMotion() ? 0 : 300)
  }

  function settle(width: number) {
    setDragging(false)
    if (offset < -width * longSwipe) remove()
    else setOffset(offset < -pillRoom / 2 ? -pillRoom : 0)
  }

  const handlers = {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      gesture.current = { x: event.clientX, y: event.clientY, base: offset, swiping: null }
      swiped.current = false
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const start = gesture.current
      if (!start) return
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      if (start.swiping === null) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          start.swiping = true
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
        } else if (Math.abs(dy) > 8) {
          // Scrolling the list, not swiping the row.
          gesture.current = null
          return
        } else return
      }
      swiped.current = true
      setOffset(Math.min(0, start.base + dx))
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      const start = gesture.current
      gesture.current = null
      if (start?.swiping) settle(event.currentTarget.offsetWidth)
    },
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
      const start = gesture.current
      gesture.current = null
      if (start?.swiping) settle(event.currentTarget.offsetWidth)
    },
  }

  return (
    <li ref={row} className={`${className} fold relative`} data-closed={leaving ? '' : undefined}>
      <div className="relative">
        <div
          aria-hidden={!open || undefined}
          className="absolute inset-y-0 right-0 flex w-28 items-center justify-center"
        >
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={remove}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-danger px-3.5 text-sm font-semibold text-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <TrashIcon aria-hidden className="size-[1.0625rem]" />
            {deleteLabel}
          </button>
        </div>
        <button
          type="button"
          {...handlers}
          onClickCapture={(event) => {
            // The click that ends a swipe, or a tap that closes the pill, opens nothing.
            if (swiped.current || offset !== 0) {
              event.preventDefault()
              event.stopPropagation()
              swiped.current = false
              setOffset(0)
            }
          }}
          onClick={onClick}
          style={{ transform: `translateX(${leaving ? '-100%' : `${String(offset)}px`})` }}
          // pan-y: the browser keeps vertical scrolling and leaves sideways moves to us.
          className={`${rowClass} relative touch-pan-y bg-surface select-none ${
            dragging ? '' : 'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]'
          } motion-reduce:transition-none`}
        >
          <RowBody tone="text" {...content} />
        </button>
      </div>
    </li>
  )
}
