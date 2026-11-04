import type { HomeCard } from '@repo/api'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReorderSheet } from '../../components/ui/reorder-sheet'
import { preferencesChange, useLedger, useSaveRecords } from '../wallets/use-ledger'
import { cardOrder } from './use-home'

/**
 * DSH-10: Home's cards in the person's order, each with a switch to show or hide it,
 * as iOS's Today view edits its widgets. This month always comes first, so it isn't
 * in the list. Saved with Done, in the preferences record like any setting.
 */
export function EditHomeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { data: ledger } = useLedger()
  const save = useSaveRecords()
  const saved = cardOrder(ledger?.preferences?.home)
  const [hidden, setHidden] = useState(saved.hidden)
  // Each time the sheet opens, it starts from what is saved.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setHidden(saved.hidden)
  }
  if (!ledger) return null

  const toggle = (card: HomeCard) => {
    const next = new Set(hidden)
    if (next.has(card)) next.delete(card)
    else next.add(card)
    setHidden(next)
  }

  return (
    <ReorderSheet
      open={open}
      title={t('home.edit.title')}
      intro={t('home.edit.intro')}
      items={saved.order.map((card) => {
        const name = t(`home.cards.${card}`)
        const shown = !hidden.has(card)
        return {
          id: card,
          name,
          // DL-CMP-10: on or off is a switch.
          trailing: (
            <button
              type="button"
              role="switch"
              aria-checked={shown}
              aria-label={t('home.edit.show', { name })}
              onClick={() => {
                toggle(card)
              }}
              className="grid min-h-11 min-w-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-brand"
            >
              <span aria-hidden className="switch" data-on={shown ? '' : undefined} />
            </button>
          ),
        }
      })}
      pending={save.isPending}
      failed={save.isError}
      onSave={(ids, done) => {
        const order = ids as HomeCard[]
        save.mutate(
          [
            preferencesChange(ledger, {
              home: { order, hidden: order.filter((card) => hidden.has(card)) },
            }),
          ],
          { onSuccess: done },
        )
      }}
      onClose={onClose}
    />
  )
}
