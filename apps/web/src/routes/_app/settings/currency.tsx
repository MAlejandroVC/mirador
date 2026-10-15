import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useSettingsBack } from '../../../components/shell/settings-back'
import { IconTile } from '../../../components/ui/icon-tile'
import { CurrencyCircleDollarIcon } from '../../../components/ui/icons'
import { Page } from '../../../components/ui/page'
import {
  CurrencyList,
  preferencesChange,
  useLedger,
  useSaveRecords,
} from '../../../features/wallets'

export const Route = createFileRoute('/_app/settings/currency')({
  component: Currency,
})

// Settings > Currency (SYS-01): the default currency, which new wallets start with and
// every total is shown in. It is saved in an encrypted record, so it follows the person
// to every device. A choice takes effect at once, so there is no Save.
function Currency() {
  const { t } = useTranslation()
  const back = useSettingsBack()
  const { data: ledger } = useLedger()
  const save = useSaveRecords()

  return (
    <Page
      title={t('settings.currency.title')}
      back={back}
      card={{
        icon: <IconTile icon={CurrencyCircleDollarIcon} size="large" />,
        description: t('settings.currency.description'),
      }}
    >
      {ledger && (
        <CurrencyList
          value={ledger.defaultCurrency}
          onChoose={(currency) => {
            save.mutate([preferencesChange(ledger.preferencesId, currency)])
          }}
        />
      )}
      {save.isError && (
        <p className="px-4 text-[0.8125rem] text-warning">{t('wallets.saveFailed')}</p>
      )}
    </Page>
  )
}
