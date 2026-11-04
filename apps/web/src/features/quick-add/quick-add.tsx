import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { WalletIcon } from '../../components/ui/icons'
import { EntrySheet } from '../transactions/entry-sheet'
import { useLedger } from '../wallets/use-ledger'
import { WalletSheet } from '../wallets/wallet-sheet'
import { QuickAddContext } from './use-quick-add'

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const value = useMemo(
    () => ({
      open: () => {
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
        onClose={() => {
          setIsOpen(false)
        }}
      />
    </QuickAddContext>
  )
}

// WID-01, WID-03: manual entry, the amount first, everything else filled in. Taking or
// choosing a picture (WID-02, WID-04) joins it with statement and image import (IMP).
function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <EntrySheet
      open={open}
      mode={{ kind: 'new', source: 'quickAdd' }}
      onClose={onClose}
      empty={<NoWallets />}
    />
  )
}

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
