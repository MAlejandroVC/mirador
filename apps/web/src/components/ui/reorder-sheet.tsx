import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import { ease, reduceMotion } from '../../lib/motion'
import { DotsSixVerticalIcon } from './icons'
import { Sheet } from './sheet'
import { SubmitButton } from './submit-button'
import { useSubmit } from './use-submit'

/** One row to put in order: its id, its name and its tile. */
export interface ReorderItem {
  id: string
  name: string
  leading: ReactNode
}

// WAL-10, CAT-01: things in one list with a grip at the right of each row, as in iOS:
// drag a grip and its row lifts and follows the finger while the others slide aside
// to make room; letting go settles it in that place. The grip is also a button that moves its row with the
// arrow keys, so it works without a pointer. Nothing is deleted here (no swipe).
export function ReorderSheet({
  open,
  title,
  intro,
  items,
  pending,
  failed,
  onSave,
  onClose,
}: {
  open: boolean
  title: string
  intro: string
  items: readonly ReorderItem[]
  pending: boolean
  failed: boolean
  /** Saves the new order, then calls `done`. */
  onSave: (ids: string[], done: () => void) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} title={title} cancelLabel={t('nav.cancel')} onClose={onClose}>
      {open && (
        <ReorderForm
          intro={intro}
          items={items}
          pending={pending}
          failed={failed}
          onSave={onSave}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

/** A row being dragged: where it was and where it would go, and the rows' places. */
interface Drag {
  from: number
  to: number
  startY: number
  dy: number
  tops: number[]
  heights: number[]
}

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

function ReorderForm({
  intro,
  items,
  pending,
  failed,
  onSave,
  onClose,
}: {
  intro: string
  items: readonly ReorderItem[]
  pending: boolean
  failed: boolean
  onSave: (ids: string[], done: () => void) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [order, setOrder] = useState(items)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const rows = useRef(new Map<string, HTMLLIElement>())
  const form = useSubmit()

  // DL-MOT-07: rows slide to their new places rather than jumping there. Each row's
  // place is kept, and after a move each one starts from its old place.
  const places = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    for (const [id, row] of rows.current) {
      const top = row.offsetTop
      const before = places.current.get(id)
      places.current.set(id, top)
      if (before === undefined || before === top || typeof row.animate !== 'function') continue
      if (reduceMotion()) continue
      row.animate([{ translate: `0 ${String(before - top)}px` }, { translate: '0 0' }], {
        duration: 250,
        easing: ease,
      })
    }
  }, [order])

  const moveTo = (id: string, to: number) => {
    setOrder((current) => {
      const from = current.findIndex((wallet) => wallet.id === id)
      const target = Math.max(0, Math.min(to, current.length - 1))
      if (from === -1 || from === target) return current
      return move(current, from, target)
    })
  }

  // The list keeps its order while a row is dragged, so the grip keeps the pointer: the
  // rows only move by translation, measured once when the drag starts. The order
  // changes once, on letting go.
  // Places are kept in the sheet's own coordinates (as if it were not scrolled), so a
  // long list can scroll under the finger mid-drag.
  const scroller = useRef<HTMLElement | null>(null)
  const pointerY = useRef(0)
  const scrolled = () => scroller.current?.scrollTop ?? 0

  const startDrag = (event: PointerEvent, from: number) => {
    const boxes = order.map((item) => rows.current.get(item.id)?.getBoundingClientRect())
    if (boxes.some((box) => !box)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    scroller.current = event.currentTarget.closest('dialog')
    pointerY.current = event.clientY
    const offset = scrolled()
    setDrag({
      from,
      to: from,
      startY: event.clientY + offset,
      dy: 0,
      tops: boxes.map((box) => (box?.top ?? 0) + offset),
      heights: boxes.map((box) => box?.height ?? 0),
    })
  }

  const follow = useCallback(() => {
    const y = pointerY.current + (scroller.current?.scrollTop ?? 0)
    setDrag((current) => {
      if (!current) return current
      const { from, tops, heights } = current
      const first = tops[0] ?? 0
      const last = (tops.at(-1) ?? 0) + (heights.at(-1) ?? 0)
      const height = heights[from] ?? 0
      const top = tops[from] ?? 0
      // The row stays within the list.
      const dy = Math.max(first - top, Math.min(y - current.startY, last - height - top))
      const middle = top + dy + height / 2
      // Its place is after every other row whose middle it has passed. Held against
      // either end of the list, it has passed every row on the way there.
      let to = 0
      for (const [index, rowTop] of tops.entries()) {
        const rowMiddle = rowTop + (heights[index] ?? 0) / 2
        if (index < from ? rowMiddle < middle : index > from && rowMiddle <= middle) to++
      }
      return { ...current, dy, to }
    })
  }, [])

  const moveDrag = (event: PointerEvent) => {
    pointerY.current = event.clientY
    follow()
  }

  // Held near the top or bottom of the sheet, the list scrolls on by itself, as in iOS.
  const dragging = drag !== null
  useEffect(() => {
    const sheet = scroller.current
    if (!dragging || !sheet) return
    let frame = requestAnimationFrame(function step() {
      const box = sheet.getBoundingClientRect()
      // The bottom edge sits above the Done button, which stays in view.
      const speed =
        pointerY.current < box.top + 96 ? -6 : pointerY.current > box.bottom - 136 ? 6 : 0
      const before = sheet.scrollTop
      if (speed) sheet.scrollTop += speed
      if (sheet.scrollTop !== before) follow()
      frame = requestAnimationFrame(step)
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [dragging, follow])

  // How far each row sits from its place while one is dragged.
  const shiftOf = (index: number) => {
    if (!drag) return 0
    const { from, to, dy, heights } = drag
    if (index === from) return dy
    const height = heights[from] ?? 0
    if (from < to && index > from && index <= to) return -height
    if (to < from && index >= to && index < from) return height
    return 0
  }

  const endDrag = () => {
    if (!drag) return
    // Each row starts its slide (DL-MOT-07) from where it is on screen, so the dragged
    // row settles into its place from under the finger instead of jumping.
    for (const [index, item] of order.entries()) {
      const row = rows.current.get(item.id)
      if (row) places.current.set(item.id, row.offsetTop + shiftOf(index))
    }
    const { from, to } = drag
    setDrag(null)
    const id = order[from]?.id
    if (id !== undefined && to !== from) moveTo(id, to)
    else {
      const row = id === undefined ? undefined : rows.current.get(id)
      if (row && typeof row.animate === 'function' && !reduceMotion())
        row.animate([{ translate: `0 ${String(drag.dy)}px` }, { translate: '0 0' }], {
          duration: 250,
          easing: ease,
        })
    }
  }

  const onKeyDown = (event: KeyboardEvent, wallet: ReorderItem, index: number) => {
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (step === 0) return
    event.preventDefault()
    const to = Math.max(0, Math.min(index + step, order.length - 1))
    moveTo(wallet.id, to)
    setAnnouncement(t('reorder.moved', { name: wallet.name, place: to + 1, count: order.length }))
  }

  return (
    <>
      <p className="px-2 text-center text-[0.9375rem] text-text-muted">{intro}</p>
      {/* Not clipped, so the lifted row keeps its whole shadow. */}
      <ul className="rounded-2xl bg-inset">
        {order.map((wallet, index) => (
          <li
            key={wallet.id}
            ref={(row) => {
              if (row) rows.current.set(wallet.id, row)
              else rows.current.delete(wallet.id)
            }}
            style={drag ? { translate: `0 ${String(shiftOf(index))}px` } : undefined}
            className={`relative flex min-h-[3.25rem] items-center gap-3 border-separator pl-4 not-first:border-t ${
              drag?.from === index
                ? 'z-10 rounded-xl bg-thumb shadow-[0_8px_24px_rgb(0_0_0/22%)]'
                : drag
                  ? 'transition-[translate] duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'
                  : ''
            }`}
          >
            {wallet.leading}
            <span className="flex-1 text-[0.9375rem] text-text">{wallet.name}</span>
            <button
              type="button"
              aria-label={t('reorder.handle', { name: wallet.name })}
              aria-describedby="reorder-help"
              onKeyDown={(event) => {
                onKeyDown(event, wallet, index)
              }}
              onPointerDown={(event) => {
                if (event.pointerType === 'mouse' && event.button !== 0) return
                startDrag(event, index)
              }}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              // The grip owns the gesture, so dragging it neither scrolls nor closes the sheet.
              data-drag
              className="flex min-h-11 min-w-11 cursor-grab touch-none items-center justify-center text-text-faint focus-visible:outline-2 focus-visible:outline-brand active:cursor-grabbing"
            >
              <DotsSixVerticalIcon aria-hidden className="size-[1.375rem]" />
            </button>
          </li>
        ))}
      </ul>
      <p id="reorder-help" className="sr-only">
        {t('reorder.help')}
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <SubmitButton
        button={form.button}
        done={form.done}
        pending={pending}
        before={
          failed && <p className="px-4 text-[0.8125rem] text-warning">{t('wallets.saveFailed')}</p>
        }
        onClick={() => {
          onSave(
            order.map((item) => item.id),
            () => {
              form.finish(onClose)
            },
          )
        }}
      >
        {t('reorder.done')}
      </SubmitButton>
    </>
  )
}
