import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionSheet } from '../../components/ui/action-sheet'
import { RateSheet } from './rate-sheet'
import { type Ledger, preferencesChange, useSaveRecords } from './use-ledger'

/**
 * SYS-01, SYS-04: wallets in a currency other than the default one count in no total
 * until it has an exchange rate. Right after such wallets arrive (added or imported),
 * and from Home when most wallets are in it, the person chooses: add the rate, make
 * that currency the default, or leave it for later, knowing those amounts stay out of
 * the totals. Home also offers to stop suggesting it (`onKeep`).
 */
export function CurrencyChoice({
  currency,
  ledger,
  onKeep,
  onClose,
}: {
  /** The other currency; null while closed. */
  currency: string | null
  ledger: Pick<Ledger, 'preferencesId' | 'preferences' | 'defaultCurrency' | 'rates'>
  onKeep?: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const save = useSaveRecords()
  // The rate sheet stays open after the choice closes, so it keeps the currency.
  const [rateFor, setRateFor] = useState<string | null>(null)
  const main = ledger.defaultCurrency
  const values = { currency: currency ?? '', main }

  return (
    <>
      <ActionSheet
        open={currency !== null}
        title={t('rates.choice.title', values)}
        message={t('rates.choice.message', values)}
        actions={[
          {
            label: t('rates.choice.rate'),
            onSelect: () => {
              setRateFor(currency)
              onClose()
            },
          },
          {
            label: t('rates.choice.makeDefault', values),
            onSelect: () => {
              if (currency) save.mutate([preferencesChange(ledger, { defaultCurrency: currency })])
              onClose()
            },
          },
          ...(onKeep
            ? [
                {
                  label: t('rates.choice.keep', values),
                  onSelect: () => {
                    onKeep()
                    onClose()
                  },
                },
              ]
            : []),
        ]}
        cancelLabel={t('rates.later')}
        onClose={onClose}
      />
      <RateSheet
        open={rateFor !== null}
        currency={rateFor ?? main}
        defaultCurrency={main}
        rates={ledger.rates}
        onClose={() => {
          setRateFor(null)
        }}
      />
    </>
  )
}
