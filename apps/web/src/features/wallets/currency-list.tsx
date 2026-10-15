import { allCurrencies, commonCurrencies, currencyName } from '@repo/core'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChoiceRow } from '../../components/ui/choice-row'
import { MagnifyingGlassIcon } from '../../components/ui/icons'
import { List } from '../../components/ui/list'
import { useLocale } from '../../lib/format'

// SYS-01, WAL-02: every currency the platform knows, named in the app language, with
// the common ones first and a search field for the rest.
export function CurrencyList({
  value,
  onChoose,
  inset,
  disabled,
}: {
  value: string
  onChoose: (currency: string) => void
  inset?: boolean
  /** Currencies that can't be chosen, with the reason shown under them. */
  disabled?: (currency: string) => string | null
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const named = useMemo(
    () => allCurrencies().map((code) => ({ code, name: currencyName(code, locale) })),
    [locale],
  )
  const search = query.trim().toLocaleLowerCase(locale)
  const matches = search
    ? named.filter(
        (currency) =>
          currency.code.toLowerCase().includes(search) ||
          currency.name.toLocaleLowerCase(locale).includes(search),
      )
    : null
  const common = commonCurrencies.flatMap((code) =>
    named.filter((currency) => currency.code === code),
  )
  const row = ({ code, name }: { code: string; name: string }) => {
    const reason = disabled?.(code)
    return (
      <ChoiceRow
        key={code}
        role="radio"
        title={`${name} (${code})`}
        {...(reason ? { subtitle: reason } : {})}
        checked={code === value}
        onToggle={() => {
          if (!reason) onChoose(code)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">{t('currency.search')}</span>
        <MagnifyingGlassIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-[1.125rem] -translate-y-1/2 text-text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
          }}
          placeholder={t('currency.search')}
          className={`min-h-11 w-full rounded-xl pr-3 pl-9 text-[1.0625rem] text-text placeholder:text-text-muted focus:outline-2 focus:outline-offset-1 focus:outline-brand ${inset ? 'bg-inset' : 'bg-surface'}`}
        />
      </label>
      {matches ? (
        matches.length > 0 ? (
          <List inset={inset}>{matches.map(row)}</List>
        ) : (
          <p className="px-4 text-[0.9375rem] text-text-muted">{t('currency.none')}</p>
        )
      ) : (
        <>
          <List label={t('currency.common')} inset={inset}>
            {common.map(row)}
          </List>
          <List label={t('currency.all')} inset={inset}>
            {named.filter((currency) => !commonCurrencies.includes(currency.code)).map(row)}
          </List>
        </>
      )}
    </div>
  )
}
