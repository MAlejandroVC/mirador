import { type InputHTMLAttributes, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

// A rule the value has to meet, ticked off while the person types.
export interface FieldCheck {
  label: string
  met: boolean
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  // More about the field, behind an (i) button next to its label.
  info?: string
  // Shown only while the field has focus, like most apps do.
  checks?: FieldCheck[]
  error?: string | undefined
  // A good outcome to announce, such as a username that is free.
  success?: string | undefined
}

export function TextField({
  label,
  hint,
  info,
  checks,
  error,
  success,
  type = 'text',
  ...props
}: TextFieldProps) {
  const { t } = useTranslation()
  const id = useId()
  const [revealed, setRevealed] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const isPassword = type === 'password'
  const showChecks = focused && checks && checks.length > 0
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
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="text-sm font-medium text-text">
          {label}
        </label>
        {info && (
          // 44 px to tap, without making the label row taller.
          <button
            type="button"
            onClick={() => {
              setInfoOpen((open) => !open)
            }}
            aria-expanded={infoOpen}
            aria-controls={`${id}-info`}
            aria-label={t('form.info', { label })}
            className="-my-3 flex min-h-11 min-w-11 items-center justify-center text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-brand"
          >
            <InfoIcon />
          </button>
        )}
      </div>
      {info && (
        <p
          id={`${id}-info`}
          hidden={!infoOpen}
          className="rounded-lg bg-fill px-3 py-2 text-sm text-text-muted"
        >
          {info}
        </p>
      )}
      <div
        className="relative"
        onFocus={() => {
          setFocused(true)
        }}
        onBlur={(event) => {
          // Showing the password with the eye button keeps the checks open.
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
        }}
      >
        <input
          id={id}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`min-h-11 w-full rounded-xl border bg-inset px-3 text-[1.0625rem] text-text focus:outline-2 focus:outline-offset-1 focus:outline-brand ${isPassword ? 'pr-12' : ''} ${error ? 'border-warning' : 'border-transparent'}`}
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
            className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center text-text-muted hover:text-text"
          >
            <EyeIcon crossed={revealed} />
          </button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      {showChecks && (
        <ul id={`${id}-checks`} className="flex flex-col gap-1 pt-1">
          {checks.map((check) => (
            <li
              key={check.label}
              className={`flex items-center gap-2 text-sm ${check.met ? 'text-brand' : 'text-text-muted'}`}
            >
              <CheckIcon met={check.met} />
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

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  )
}

function CheckIcon({ met }: { met: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none">
      {met ? (
        <>
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path d="m7.5 12.5 3 3 6-6.5" stroke="white" strokeWidth="2.5" />
        </>
      ) : (
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      )}
    </svg>
  )
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M3 3l18 18" />}
    </svg>
  )
}
