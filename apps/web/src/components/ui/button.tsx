import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-400',
  secondary:
    'border border-slate-300 bg-white text-slate-900 hover:bg-slate-100 disabled:text-slate-400',
  ghost: 'text-slate-700 underline-offset-4 hover:underline disabled:text-slate-400',
  // For what can't be undone, such as deleting the account.
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-300',
}

// At least 44 by 44 pixels, so it is easy to tap on a phone.
export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-4 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
