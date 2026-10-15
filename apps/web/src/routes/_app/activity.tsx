import { ReceiptIcon } from '../../components/ui/icons'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AccountButton } from '../../components/shell'
import { EmptyState } from '../../components/ui/empty-state'
import { Page } from '../../components/ui/page'

export const Route = createFileRoute('/_app/activity')({
  component: Activity,
})

// Epic 2: the transaction list (TXN) replaces the placeholder.
function Activity() {
  const { t } = useTranslation()
  return (
    <Page title={t('nav.activity')} actions={<AccountButton />}>
      <EmptyState icon={ReceiptIcon} title={t('placeholder.activity.title')}>
        {t('placeholder.activity.body')}
      </EmptyState>
    </Page>
  )
}
