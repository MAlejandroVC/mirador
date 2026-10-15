import { ChartPieSliceIcon } from '../../components/ui/icons'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AccountButton } from '../../components/shell'
import { EmptyState } from '../../components/ui/empty-state'
import { Page } from '../../components/ui/page'

export const Route = createFileRoute('/_app/budget')({
  component: Budget,
})

// Epic 6: the budget and its goals (BUD) replace the placeholder.
function Budget() {
  const { t } = useTranslation()
  return (
    <Page title={t('nav.budget')} actions={<AccountButton />}>
      <EmptyState icon={ChartPieSliceIcon} title={t('placeholder.budget.title')}>
        {t('placeholder.budget.body')}
      </EmptyState>
    </Page>
  )
}
