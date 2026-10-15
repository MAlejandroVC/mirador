import { currencyName, rateInUse, toCalendarDate, unitsPerOne } from '@repo/core'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsBack } from '../../../components/shell/settings-back'
import { IconTile } from '../../../components/ui/icon-tile'
import { CurrencyCircleDollarIcon } from '../../../components/ui/icons'
import { List, ListButtonRow } from '../../../components/ui/list'
import { Page } from '../../../components/ui/page'
import {
  CurrencyList,
  preferencesChange,
  RateSheet,
  useLedger,
  useSaveRecords,
} from '../../../features/wallets'
import { formatDay, formatRate, useLocale } from '../../../lib/format'

export const Route = createFileRoute('/_app/settings/currency')({
  component: Currency,
})

// Settings > Currency (SYS-01): the default currency, which new wallets start with and
// every total is shown in. It is saved in an encrypted record, so it follows the person
// to every device. A choice takes effect at once, so there is no Save. Above it, the
// exchange rate of each other currency the wallets use (SYS-04, SYS-05).
function Currency() {
  const { t } = useTranslation()
  const locale = useLocale()
  const back = useSettingsBack()
  const { data: ledger } = useLedger()
  const save = useSaveRecords()
  const [rateFor, setRateFor] = useState<string | null>(null)
  const today = toCalendarDate(new Date())
  const others = ledger
    ? [
        ...new Set(
          ledger.wallets
            .map((wallet) => wallet.currency)
            .filter((currency) => currency !== ledger.defaultCurrency),
        ),
      ].sort()
    : []

  return (
    <Page
      title={t('settings.currency.title')}
      back={back}
      card={{
        icon: <IconTile icon={CurrencyCircleDollarIcon} size="large" />,
        description: t('settings.currency.description'),
      }}
    >
      {ledger && others.length > 0 && (
        <List label={t('rates.section')}>
          {others.map((currency) => {
            const inUse = rateInUse(currency, ledger.defaultCurrency, ledger.rates, today)
            return (
              <ListButtonRow
                key={currency}
                tone="text"
                title={currencyName(currency, locale)}
                subtitle={
                  inUse
                    ? `1 ${currency} = ${formatRate(unitsPerOne(inUse), locale)} ${ledger.defaultCurrency} · ${formatDay(inUse.rate.date, today, locale, { today: t('dates.today'), yesterday: t('dates.yesterday') })}`
                    : t('rates.missing')
                }
                trailing={
                  <span className={`text-[0.9375rem] ${inUse ? 'text-text-muted' : 'text-brand'}`}>
                    {inUse ? t('rates.change') : t('rates.add')}
                  </span>
                }
                onClick={() => {
                  setRateFor(currency)
                }}
              />
            )
          })}
        </List>
      )}
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
      {ledger && (
        <RateSheet
          open={rateFor !== null}
          currency={rateFor ?? ledger.defaultCurrency}
          defaultCurrency={ledger.defaultCurrency}
          rates={ledger.rates}
          onClose={() => {
            setRateFor(null)
          }}
        />
      )}
    </Page>
  )
}
