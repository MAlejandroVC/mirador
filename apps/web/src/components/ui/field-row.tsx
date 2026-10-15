import { type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { MoneyInput } from './money-input'

// DL-CMP-09: a field inside a sheet as an iOS Settings row: the label at the left, the
// value typed at the right, on the `inset` fill. Group rows in one <ul> (FieldRows),
// with a hint or the first error below them.
export function FieldRow({
  label,
  suffix,
  error,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label: string
  /** What follows the value, such as "%" or "MXN". */
  suffix?: string
  error?: boolean
}) {
  const id = useId()
  return (
    <li className="flex min-h-[3.25rem] items-center gap-3 border-separator px-4 not-first:border-t">
      <label htmlFor={id} className="flex-1 text-[0.9375rem] text-text">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        data-autofocus={props.autoFocus ? '' : undefined}
        className="min-h-11 w-32 min-w-0 bg-transparent text-right text-[0.9375rem] text-text placeholder:text-text-faint focus:outline-2 focus:outline-brand aria-invalid:text-warning"
        {...props}
      />
      {suffix && <span className="-ml-2 text-[0.9375rem] text-text-muted">{suffix}</span>}
    </li>
  )
}

/** An amount in a FieldRow: grouped as it is typed, with the cents to come faint. */
export function MoneyRow({
  label,
  value,
  onChange,
  locale,
  decimals,
  shownDecimals,
  suffix,
  error,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'value' | 'onChange'> & {
  label: string
  value: string
  onChange: (value: string) => void
  locale: string
  decimals: number
  shownDecimals?: number
  /** The currency code after the amount. */
  suffix?: string
  error?: boolean
}) {
  const id = useId()
  return (
    <li className="flex min-h-[3.25rem] items-center gap-3 border-separator px-4 not-first:border-t">
      <label htmlFor={id} className="shrink-0 text-[0.9375rem] text-text">
        {label}
      </label>
      <span className="flex min-w-0 flex-1 justify-end">
        <MoneyInput
          id={id}
          value={value}
          onChange={onChange}
          locale={locale}
          decimals={decimals}
          {...(shownDecimals === undefined ? {} : { shownDecimals })}
          aria-invalid={error ? true : undefined}
          className={`min-h-11 max-w-full rounded-md text-right text-[0.9375rem] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand ${
            error ? 'text-warning' : 'text-text'
          }`}
          {...props}
        />
      </span>
      {suffix && <span className="-ml-1.5 text-[0.9375rem] text-text-muted">{suffix}</span>}
    </li>
  )
}

export function FieldRows({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <ul className="rounded-2xl bg-inset">{children}</ul>
      {note}
    </div>
  )
}

/** The line under a group of fields: a hint in `text-muted`, an error in `warning`. */
export function FieldNote({ children, error }: { children: ReactNode; error?: boolean }) {
  return (
    <p
      role={error ? 'alert' : undefined}
      className={`px-4 text-[0.8125rem] ${error ? 'text-warning' : 'text-text-muted'}`}
    >
      {children}
    </p>
  )
}
