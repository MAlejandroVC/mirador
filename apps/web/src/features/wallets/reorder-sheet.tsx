import { walletRecord } from '@repo/api'
import { reorderedWallets } from '@repo/core'
import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { IconTile } from '../../components/ui/icon-tile'
import { DotsSixVerticalIcon } from '../../components/ui/icons'
import { Sheet, SheetFooter } from '../../components/ui/sheet'
import { type LedgerWallet, type RecordChange, useSaveRecords, walletBody } from './use-ledger'
import { walletIconComponents } from './wallet-look'

// WAL-10: the wallets in one list with a grip at the right of each row, as in iOS: drag
// a grip to move its wallet. The grip is also a button that moves its wallet with the
// arrow keys, so it works without a pointer. Nothing is deleted here (no swipe), since
// deleting a wallet is a bigger step that lives in Edit (WAL-08).
export function ReorderSheet({
  open,
  wallets,
  onClose,
}: {
  open: boolean
  wallets: readonly LedgerWallet[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={open}
      title={t('wallets.reorder.title')}
      cancelLabel={t('nav.cancel')}
      onClose={onClose}
    >
      {open && <ReorderForm wallets={wallets} onClose={onClose} />}
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
  wallets,
  onClose,
}: {
  wallets: readonly LedgerWallet[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const save = useSaveRecords()
  const [order, setOrder] = useState(wallets)
  const [dragging, setDragging] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const rows = useRef(new Map<string, HTMLLIElement>())

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

  const onKeyDown = (event: KeyboardEvent, wallet: LedgerWallet, index: number) => {
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (step === 0) return
    event.preventDefault()
    const to = Math.max(0, Math.min(index + step, order.length - 1))
    moveTo(wallet.id, to)
    setAnnouncement(
      t('wallets.reorder.moved', { name: wallet.name, place: to + 1, count: order.length }),
    )
  }

  return (
    <>
      <p className="px-2 text-center text-[0.9375rem] text-text-muted">
        {t('wallets.reorder.intro')}
      </p>
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
            <IconTile icon={walletIconComponents[wallet.icon]} color={wallet.color} />
            <span className="flex-1 text-[0.9375rem] text-text">{wallet.name}</span>
            <button
              type="button"
              aria-label={t('wallets.reorder.handle', { name: wallet.name })}
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
              // The grip owns the gesture, so dragging it doesn't scroll the sheet.
              className="flex min-h-11 min-w-11 cursor-grab touch-none items-center justify-center text-text-faint focus-visible:outline-2 focus-visible:outline-brand active:cursor-grabbing"
            >
              <DotsSixVerticalIcon aria-hidden className="size-[1.375rem]" />
            </button>
          </li>
        ))}
      </ul>
      <p id="reorder-help" className="sr-only">
        {t('wallets.reorder.help')}
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {save.isError && (
        <p className="px-4 text-[0.8125rem] text-warning">{t('wallets.saveFailed')}</p>
      )}
      <SheetFooter>
        <Button
          className="w-full"
          disabled={save.isPending}
          onClick={() => {
            // Only the wallets whose place changed are saved.
            const changes: RecordChange[] = reorderedWallets(order).map((wallet) => ({
              id: wallet.id,
              body: walletBody(walletRecord.parse(wallet)),
            }))
            if (changes.length === 0) onClose()
            else save.mutate(changes, { onSuccess: onClose })
          }}
        >
          {t('wallets.reorder.done')}
        </Button>
      </SheetFooter>
    </>
  )
}
