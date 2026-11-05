import { type MissingRates, missingRates, toCalendarDate } from '@repo/core'
import { useTranslation } from 'react-i18next'
import { IconTile } from '../../components/ui/icon-tile'
import { CurrencyCircleDollarIcon } from '../../components/ui/icons'
import { List, ListButtonRow, ListLinkRow } from '../../components/ui/list'
import { type Ledger, preferencesChange, useSaveRecords } from './use-ledger'

/**
 * SYS-01, SYS-04: wallets without a rate to the default currency are left out of every
 * total, so they are named instead of quietly making net worth zero. When none of the
 * wallets uses the default currency (peso wallets imported on an English device), one
 * tap shows totals in theirs; otherwise Settings > Currency takes the missing rates.
 */
export function MissingRatesRow({
  missing,
  ledger,
}: {
  missing: Pick<MissingRates, 'switchTo'> & { count: number }
  ledger: Pick<Ledger, 'preferencesId' | 'preferences' | 'defaultCurrency'>
}) {
  const { t } = useTranslation()
  const save = useSaveRecords()
  const leading = <IconTile icon={CurrencyCircleDollarIcon} />
  const { switchTo, count } = missing
  if (switchTo)
    return (
      <ListButtonRow
        leading={leading}
        title={t('rates.switch', { currency: switchTo })}
        subtitle={
          save.isError
            ? t('wallets.saveFailed')
            : t('rates.switchBody', { currency: switchTo, current: ledger.defaultCurrency })
        }
        disabled={save.isPending}
        onClick={() => {
          save.mutate([preferencesChange(ledger, { defaultCurrency: switchTo })])
        }}
      />
    )
  return (
    <ListLinkRow
      to="/settings/currency"
      leading={leading}
      title={t('rates.addMany', { count })}
      subtitle={t('rates.leftOut', { count })}
    />
  )
}

/**
 * SYS-04: the same, as its own list, on screens whose figures would otherwise be empty
 * or short for no visible reason (Budget's Plan and Spending: transactions in a
 * wallet without a rate count in no total).
 */
export function MissingRatesNotice({
  ledger,
}: {
  ledger: Pick<Ledger, 'preferencesId' | 'preferences' | 'defaultCurrency' | 'wallets' | 'rates'>
}) {
  const missing = missingRates(
    ledger.wallets,
    ledger.defaultCurrency,
    ledger.rates,
    toCalendarDate(new Date()),
  )
  if (!missing) return null
  return (
    <List>
      <MissingRatesRow
        missing={{ switchTo: missing.switchTo, count: missing.wallets.length }}
        ledger={ledger}
      />
    </List>
  )
}
