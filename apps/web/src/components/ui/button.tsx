import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

// DL-CMP-05: filled for the one main action, tinted for a second one beside it, plain
// for actions in lists and bars. Destructive actions use `danger` text, never filled.
const variants: Record<Variant, string> = {
  primary: 'bg-brand font-semibold text-on-brand disabled:opacity-40',
  secondary:
    'bg-[color-mix(in_srgb,var(--color-brand)_14%,var(--color-surface))] font-semibold text-brand disabled:opacity-40',
  ghost: 'text-brand disabled:text-text-faint',
  // For what can't be undone, such as deleting the account.
  danger:
    'bg-[color-mix(in_srgb,var(--color-danger)_12%,var(--color-surface))] font-semibold text-danger disabled:opacity-40',
}

// DL-CMP-05: 50 px tall, so it is easy to tap on a phone (DL-A11Y-05).
export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-[3.125rem] min-w-11 items-center justify-center rounded-[0.875rem] px-4 text-[1.0625rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
