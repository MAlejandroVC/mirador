import { decimalSeparator, typedAmount } from '@repo/core'
import { type InputHTMLAttributes, useLayoutEffect, useRef } from 'react'

/** Digits and the decimal separator: what the caret is kept after when commas move. */
function countMarks(text: string, decimal: string) {
  let marks = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index)
    if ((char >= '0' && char <= '9') || char === decimal) marks += 1
  }
  return marks
}

// DL-CMP-09: an amount is grouped every three digits as it is typed ("25,000"), and the
// decimals still to come show faint after it (".00") until the person types them. The
// field is exactly as wide as its text, so the faint decimals sit right beside it.
export function MoneyInput({
  value,
  onChange,
  locale,
  decimals,
  shownDecimals = decimals,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'> & {
  value: string
  onChange: (value: string) => void
  locale: string
  /** How many decimals can be typed: the currency's, or more for a rate. */
  decimals: number
  /** How many decimals the faint rest fills in. */
  shownDecimals?: number
  /** Text size and weight, shared by the typed and the faint part. */
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  const decimal = decimalSeparator(locale)
  const { rest } = typedAmount(value, locale, decimals, shownDecimals)
  // Empty, it reads "0.00", all of it faint.
  const empty = value === ''
  const faint = empty ? (shownDecimals > 0 ? `${decimal}${'0'.repeat(shownDecimals)}` : '') : rest

  // Put the caret back after the same digit once the commas have moved.
  useLayoutEffect(() => {
    const input = ref.current
    if (!input || caret.current === null || document.activeElement !== input) return
    let marks = caret.current
    let position = 0
    while (position < value.length && marks > 0) {
      const char = value.charAt(position)
      if ((char >= '0' && char <= '9') || char === decimal) marks -= 1
      position += 1
    }
    input.setSelectionRange(position, position)
    caret.current = null
  })

  return (
    <span
      className={`inline-flex min-w-0 items-center tabular-nums ${className}`}
      onClick={() => ref.current?.focus()}
    >
      {/* The hidden copy gives the field its width; the field lies on top of it. */}
      <span className="relative inline-block min-w-0">
        <span aria-hidden className="invisible pr-0.5 whitespace-pre">
          {value || '0'}
        </span>
        <input
          ref={ref}
          value={value}
          onChange={(event) => {
            const typed = event.target.value
            caret.current = countMarks(
              typed.slice(0, event.target.selectionStart ?? typed.length),
              decimal,
            )
            onChange(typedAmount(typed, locale, decimals, shownDecimals).text)
          }}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          size={1}
          // Sheet focuses it once the dialog is open (a native dialog takes focus itself).
          data-autofocus={props.autoFocus ? '' : undefined}
          className="absolute inset-0 w-full min-w-0 bg-transparent py-0 pr-0.5 pl-0 text-inherit placeholder:text-text-faint focus:outline-none"
          {...props}
        />
      </span>
      {faint && (
        <span aria-hidden className="pointer-events-none whitespace-pre text-text-faint">
          {faint}
        </span>
      )}
    </span>
  )
}
