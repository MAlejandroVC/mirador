import { type KeyboardEvent, type PointerEvent, useLayoutEffect, useRef, useState } from 'react'
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
// drag a grip to move its row. The grip is also a button that moves its row with the
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
  const [dragging, setDragging] = useState<string | null>(null)
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

  // The row the pointer is over becomes the dragged wallet's place.
  const onPointerMove = (event: PointerEvent, id: string) => {
    if (dragging !== id) return
    for (const [index, wallet] of order.entries()) {
      const row = rows.current.get(wallet.id)
      if (!row || wallet.id === id) continue
      const box = row.getBoundingClientRect()
      if (event.clientY > box.top && event.clientY < box.bottom) {
        moveTo(id, index)
        break
      }
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
      <ul className="overflow-hidden rounded-2xl bg-inset">
        {order.map((wallet, index) => (
          <li
            key={wallet.id}
            ref={(row) => {
              if (row) rows.current.set(wallet.id, row)
              else rows.current.delete(wallet.id)
            }}
            className={`flex min-h-[3.25rem] items-center gap-3 border-separator pl-4 not-first:border-t ${
              dragging === wallet.id
                ? 'relative z-10 bg-surface shadow-[0_4px_16px_rgb(0_0_0/18%)]'
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
                event.currentTarget.setPointerCapture(event.pointerId)
                setDragging(wallet.id)
              }}
              onPointerMove={(event) => {
                onPointerMove(event, wallet.id)
              }}
              onPointerUp={() => {
                setDragging(null)
              }}
              onPointerCancel={() => {
                setDragging(null)
              }}
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
