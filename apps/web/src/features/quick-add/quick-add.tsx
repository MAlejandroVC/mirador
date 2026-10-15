import { ShoppingBagIcon } from '../../components/ui/icons'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui/empty-state'
import { Sheet } from '../../components/ui/sheet'
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

// The quick-add form replaces the placeholder inside this sheet.
function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} title={t('quickAdd.title')} cancelLabel={t('nav.cancel')} onClose={onClose}>
      <EmptyState icon={ShoppingBagIcon} color="clay" title={t('quickAdd.placeholder.title')}>
        {t('quickAdd.placeholder.body')}
      </EmptyState>
    </Sheet>
  )
}
