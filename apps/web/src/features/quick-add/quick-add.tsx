import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { WalletIcon } from '../../components/ui/icons'
import { toCalendarDate, type EntryDraft } from '@repo/core'
import { readReceipt } from '@repo/import'
import { readPicture, ReadingError } from '../data/reading'
import { EntrySheet } from '../transactions/entry-sheet'
import type { PictureState } from './picture-bar'
import { useLedger } from '../wallets/use-ledger'
import { WalletSheet } from '../wallets/wallet-sheet'
import { QuickAddContext } from './use-quick-add'

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [picture, setPicture] = useState<{ file: File } | null>(null)
  const value = useMemo(
    () => ({
      open: () => {
        setPicture(null)
        setIsOpen(true)
      },
      openWith: (file: File) => {
        setPicture({ file })
        setIsOpen(true)
      },
    }),
    [],
  )
  return (
    <QuickAddContext value={value}>
      {children}
      <QuickAddSheet
        open={isOpen}
        picture={picture}
        onClose={() => {
          setIsOpen(false)
        }}
      />
    </QuickAddContext>
  )
}

// WID-01, WID-03: manual entry, the amount first, everything else filled in. Taking or
// choosing a picture (WID-02, WID-04, IMP-07) reads it on this device (IMP-11) and fills
// the same form in for the person to check and save; it is then listed under Imports
// as a receipt (IMP-42).
function QuickAddSheet({
  open,
  picture: given,
  onClose,
}: {
  open: boolean
  /** IMP-41: a receipt set aside from a statement's files, read when the sheet opens. */
  picture: { file: File } | null
  onClose: () => void
}) {
  const { data: ledger } = useLedger()
  const [picture, setPicture] = useState<Omit<PictureState, 'onPick'>>(fresh)
  const [seed, setSeed] = useState<Partial<EntryDraft>>({})
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setPicture(fresh)
      setSeed({})
    }
  }
  useEffect(() => {
    if (open && given) onPick(given.file)
    // Once for each picture it opens on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, given])

  function onPick(file: File) {
    const thumb = URL.createObjectURL(file)
    setPicture((now) => ({ ...now, phase: 'reading', thumb, unsure: [], fileName: file.name }))
    void (async () => {
      try {
        const page = await readPicture(file)
        const currency = ledger?.defaultCurrency ?? 'USD'
        const reading = readReceipt([page], { currency, today: toCalendarDate(new Date()) })
        setSeed({
          type: 'expense',
          ...(reading.amount ? { amount: reading.amount } : {}),
          ...(reading.date ? { date: reading.date } : {}),
        })
        setPicture((now) => ({
          phase: 'filled',
          unsure: reading.unsure,
          thumb: now.thumb,
          ...(now.fileName ? { fileName: now.fileName } : {}),
          ...(reading.payee ? { payeeName: reading.payee } : {}),
          version: now.version + 1,
        }))
      } catch (error) {
        setPicture((now) => ({
          ...now,
          phase: 'failed',
          failure: error instanceof ReadingError ? error.reason : 'unreadable',
        }))
      }
    })()
  }

  return (
    <EntrySheet
      open={open}
      mode={{ kind: 'new', source: 'quickAdd', seed, picture: { ...picture, onPick } }}
      onClose={onClose}
      empty={<NoWallets />}
    />
  )
}

const fresh: Omit<PictureState, 'onPick'> = { phase: 'idle', unsure: [], thumb: null, version: 0 }

/** A transaction needs a wallet to come from, so the first one is made right here. */
function NoWallets() {
  const { t } = useTranslation()
  const { data: ledger } = useLedger()
  const [adding, setAdding] = useState(false)
  return (
    <>
      <EmptyState
        icon={WalletIcon}
        title={t('transactions.noWallets.title')}
        action={
          <Button
            className="mt-1 px-6"
            onClick={() => {
              setAdding(true)
            }}
          >
            {t('wallets.add')}
          </Button>
        }
      >
        {t('transactions.noWallets.body')}
      </EmptyState>
      <WalletSheet
        open={adding}
        mode={{ kind: 'new' }}
        defaultCurrency={ledger?.defaultCurrency ?? 'USD'}
        onClose={() => {
          setAdding(false)
        }}
      />
    </>
  )
}
