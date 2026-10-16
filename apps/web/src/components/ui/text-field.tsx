import { type InputHTMLAttributes, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircleIcon, CircleIcon, EyeIcon, EyeSlashIcon } from './icons'

// A rule the value has to meet, ticked off while the person types.
export interface FieldCheck {
  label: string
  met: boolean
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  // DL-CMP-09: what the field is for, always shown under it rather than behind an (i).
  hint?: string
  // The rules the value has to meet. They show from the moment the field is focused or
  // filled until every one is met, and never fold away on blur: the button under them
  // would jump away from the finger reaching for it.
  checks?: FieldCheck[]
  error?: string | undefined
  // A good outcome to announce, such as a username that is free.
  success?: string | undefined
}

export function TextField({
  label,
  hint,
  checks,
  error,
  success,
  type = 'text',
  ...props
}: TextFieldProps) {
  const { t } = useTranslation()
  const id = useId()
  const [revealed, setRevealed] = useState(false)
  const [touched, setTouched] = useState(false)
  const isPassword = type === 'password'
  const unmet = checks?.some((check) => !check.met) ?? false
  const filled = String(props.value ?? '').length > 0
  // Once shown, the checks stay until they are all met, which happens while typing.
  const showChecks = Boolean(checks?.length) && unmet && (touched || filled)
  const describedBy = [
    hint && `${id}-hint`,
    showChecks && `${id}-checks`,
    error && `${id}-error`,
    success && `${id}-success`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <div
        className="relative"
        onFocus={() => {
          setTouched(true)
        }}
      >
        <input
          id={id}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          // DL-CMP-09: a field being typed in shows only its caret, never a box.
          className={`min-h-11 w-full rounded-xl border bg-inset px-3 text-[1.0625rem] text-text caret-brand outline-none ${isPassword ? 'pr-12' : ''} ${error ? 'border-warning' : 'border-transparent'}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => {
              setRevealed((value) => !value)
            }}
            aria-pressed={revealed}
            aria-label={revealed ? t('form.hide') : t('form.show')}
            className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center text-text-muted focus-visible:outline-2 focus-visible:outline-brand"
          >
            {revealed ? (
              <EyeSlashIcon aria-hidden className="size-5" />
            ) : (
              <EyeIcon aria-hidden className="size-5" />
            )}
          </button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      {showChecks && checks && (
        <ul id={`${id}-checks`} className="flex flex-col gap-1 pt-1">
          {checks.map((check) => (
            <li
              key={check.label}
              className={`flex items-center gap-2 text-sm ${check.met ? 'text-brand' : 'text-text-muted'}`}
            >
              {check.met ? (
                <CheckCircleIcon aria-hidden weight="fill" className="size-4 shrink-0" />
              ) : (
                <CircleIcon aria-hidden className="size-4 shrink-0" />
              )}
              <span>
                {check.label}
                <span className="sr-only">
                  {' '}
                  ({check.met ? t('form.checkMet') : t('form.checkNotMet')})
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-warning">
          {error}
        </p>
      )}
      {success && !error && (
        <p id={`${id}-success`} role="status" className="text-sm text-brand">
          {success}
        </p>
      )}
    </div>
  )
}
