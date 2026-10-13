import type { ReactNode } from 'react'

// Announced by screen readers as soon as it appears (NFR-07).
export function Alert({
  children,
  tone = 'error',
}: {
  children: ReactNode
  tone?: 'error' | 'warning' | 'success'
}) {
  const colors = {
    error: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone]
  const role = { error: 'alert', warning: 'note', success: 'status' }[tone]
  return (
    <div role={role} className={`rounded-lg border px-3 py-2 text-sm ${colors}`}>
      {children}
    </div>
  )
}
