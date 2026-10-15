import { allCurrencies, commonCurrencies, currencyName } from '@repo/core'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChoiceRow } from '../../components/ui/choice-row'
import { MagnifyingGlassIcon } from '../../components/ui/icons'
import { List } from '../../components/ui/list'
import { ShowMoreRow } from '../../components/ui/show-more-row'
import { useLocale } from '../../lib/format'

// SYS-01, WAL-02: every currency the platform knows, named in the app language, in one
// list: the common ones, always in view, then the rest behind "Show all currencies"
// (DL-CMP-15), and a search field to find any of them. The chosen currency stays in
// view even when it isn't a common one.
export function CurrencyList({
  value,
  onChoose,
  inset,
  label,
  disabled,
}: {
  value: string
  onChoose: (currency: string) => void
  inset?: boolean
  /** The section label above the list. */
  label?: string
  /** Currencies that can't be chosen, with the reason shown under them. */
  disabled?: (currency: string) => string | null
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
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
  const rest = named.filter((currency) => !commonCurrencies.includes(currency.code))
  const row = ({ code, name }: { code: string; name: string }, folded?: boolean) => {
    const reason = disabled?.(code)
    return (
      <ChoiceRow
        key={code}
        role="radio"
        title={`${name} (${code})`}
        {...(reason ? { subtitle: reason } : {})}
        checked={code === value}
        {...(folded === undefined ? {} : { folded, separator: true })}
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
          className={`min-h-11 w-full rounded-xl pr-3 pl-9 text-[1.0625rem] text-text caret-brand placeholder:text-text-muted focus:outline-none ${inset ? 'bg-inset' : 'bg-surface'}`}
        />
      </label>
      {matches ? (
        matches.length > 0 ? (
          <List inset={inset}>{matches.map((currency) => row(currency))}</List>
        ) : (
          <p className="px-4 text-[0.9375rem] text-text-muted">{t('currency.none')}</p>
        )
      ) : (
        <List inset={inset} {...(label ? { label } : {})}>
          {common.map((currency) => row(currency))}
          {rest.map((currency) => row(currency, !open && currency.code !== value))}
          <ShowMoreRow
            open={open}
            more={t('currency.showAll')}
            less={t('currency.showFewer')}
            separator
            onToggle={() => {
              setOpen(!open)
            }}
          />
        </List>
      )}
    </div>
  )
}
