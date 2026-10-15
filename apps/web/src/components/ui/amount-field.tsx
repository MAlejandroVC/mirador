import { useId } from 'react'
import { MoneyInput } from './money-input'

// DL-CMP-09: the amount is entered as a big number with the decimal keypad, its
// currency beside it, grouped as it is typed with the cents to come faint. An error
// shows right under it in `warning` (DL-PAT-05).
export function AmountField({
  label,
  value,
  onChange,
  onBlur,
  locale,
  decimals,
  prefix,
  suffix,
  error,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  locale: string
  /** The currency's decimals. */
  decimals: number
  prefix?: string
  suffix?: string
  error?: string | null
  autoFocus?: boolean
}) {
  const id = useId()
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <label htmlFor={id} className="text-[0.8125rem] text-text-muted">
        {label}
      </label>
      {/* DL-PAT-02: outlined in `warning` when Save was tapped without it. */}
      <div
        className={`flex max-w-full items-baseline justify-center gap-1 rounded-2xl px-3 ${
          error ? 'outline-2 -outline-offset-2 outline-warning' : ''
        }`}
      >
        {prefix && <span className="text-[1.4375rem] font-medium text-text-muted">{prefix}</span>}
        <MoneyInput
          id={id}
          value={value}
          onChange={onChange}
          locale={locale}
          decimals={decimals}
          {...(onBlur ? { onBlur } : {})}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-h-14 max-w-full text-[2.875rem] leading-none font-semibold tracking-[-0.03em] text-text"
        />
        {suffix && <span className="text-[1.4375rem] font-medium text-text-muted">{suffix}</span>}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-[0.8125rem] text-warning">
          {error}
        </p>
      )}
    </div>
  )
}
