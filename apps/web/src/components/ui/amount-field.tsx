import { useId } from 'react'

// DL-CMP-09: the amount is entered as a big number with the decimal keypad, its
// currency beside it. An error shows right under it in `warning` (DL-PAT-05).
export function AmountField({
  label,
  value,
  onChange,
  onBlur,
  prefix,
  suffix,
  error,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
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
      <div className="flex max-w-full items-baseline justify-center gap-1 tabular-nums">
        {prefix && <span className="text-[1.4375rem] font-medium text-text-muted">{prefix}</span>}
        <input
          id={id}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          onBlur={onBlur}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="0.00"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          // As wide as what is typed, so the currency sits right beside the number.
          style={{ width: `${String(Math.max(4, value.length) + 0.5)}ch` }}
          className="min-h-14 max-w-full min-w-0 bg-transparent text-left text-[2.875rem] leading-none font-semibold tracking-[-0.03em] text-text placeholder:text-text-faint focus:outline-none"
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
