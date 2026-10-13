import { type InputHTMLAttributes, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string | undefined
}

export function TextField({ label, hint, error, type = 'text', ...props }: TextFieldProps) {
  const { t } = useTranslation()
  const id = useId()
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`min-h-11 w-full rounded-lg border bg-white px-3 text-base text-slate-900 focus:outline-2 focus:outline-offset-1 focus:outline-slate-900 ${isPassword ? 'pr-12' : ''} ${error ? 'border-red-600' : 'border-slate-300'}`}
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
            className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center text-slate-500 hover:text-slate-900"
          >
            <EyeIcon crossed={revealed} />
          </button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
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
