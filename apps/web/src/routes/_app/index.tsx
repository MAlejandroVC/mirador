import { HouseIcon } from '../../components/ui/icons'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AccountButton } from '../../components/shell'
import { EmptyState } from '../../components/ui/empty-state'
import { Page } from '../../components/ui/page'
import { useBack } from '../../components/shell/back'

export const Route = createFileRoute('/_app/')({
  component: Home,
})

// Epic 7: the dashboard's cards (DSH-01..10) replace the placeholder.
function Home() {
  const { t } = useTranslation()
  // DL-CMP-06: opened from another screen, a tab's page can pop back to it too.
  const back = useBack()
  return (
    <Page title={t('nav.home')} back={back} actions={<AccountButton />}>
      <EmptyState icon={HouseIcon} title={t('placeholder.home.title')}>
        {t('placeholder.home.body')}
      </EmptyState>
    </Page>
  )
}
