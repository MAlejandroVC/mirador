import type { ReactNode } from 'react'

// Announced by screen readers as soon as it appears (NFR-07).
export function Alert({
  children,
  tone = 'error',
}: {
  children: ReactNode
  tone?: 'error' | 'warning'
}) {
  const colors =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-800'
      : 'border-amber-200 bg-amber-50 text-amber-900'
  return (
    <div
      role={tone === 'error' ? 'alert' : 'note'}
      className={`rounded-lg border px-3 py-2 text-sm ${colors}`}
    >
      {children}
    </div>
  )
}
