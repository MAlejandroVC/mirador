import { WalletIcon } from '../../components/ui/icons'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AccountButton } from '../../components/shell'
import { EmptyState } from '../../components/ui/empty-state'
import { Page } from '../../components/ui/page'

export const Route = createFileRoute('/_app/wallets')({
  component: Wallets,
})

// Epic 1: wallets and net worth (WAL) replace the placeholder.
function Wallets() {
  const { t } = useTranslation()
  return (
    <Page title={t('nav.wallets')} actions={<AccountButton />}>
      <EmptyState icon={WalletIcon} title={t('placeholder.wallets.title')}>
        {t('placeholder.wallets.body')}
      </EmptyState>
    </Page>
  )
}
