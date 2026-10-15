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
    // DL-PAT-05: errors use `warning`, never `danger`, which is for deleting.
    error: 'bg-[color-mix(in_srgb,var(--color-warning)_12%,var(--color-surface))] text-text',
    warning: 'bg-[color-mix(in_srgb,var(--color-warning)_12%,var(--color-surface))] text-text',
    success: 'bg-[color-mix(in_srgb,var(--color-brand)_12%,var(--color-surface))] text-text',
  }[tone]
  const role = { error: 'alert', warning: 'note', success: 'status' }[tone]
  return (
    <div role={role} className={`rounded-xl px-3 py-2 text-[0.9375rem] ${colors}`}>
      {children}
    </div>
  )
}
