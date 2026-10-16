import type { ReactNode } from 'react'
import { invalidRow } from './field-row'
import { CaretRightIcon } from './icons'

/** DL-CMP-09: a field that opens a picker: its label, the value and a chevron. */
export function PickerRow({
  label,
  value,
  valueLeading,
  error,
  separator,
  onClick,
}: {
  label: string
  value: string
  valueLeading?: ReactNode
  error: boolean
  /** Whether the hairline above shows; by default on every row but the first. */
  separator?: boolean
  onClick: () => void
}) {
  const hairline = separator === undefined ? 'not-first:border-t' : separator ? 'border-t' : ''
  return (
    <li className={`border-separator ${hairline} ${invalidRow}`}>
      <button
        type="button"
        onClick={onClick}
        aria-invalid={error || undefined}
        className="flex min-h-[3.25rem] w-full items-center gap-2 px-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      >
        <span className="shrink-0 text-[0.9375rem] text-text">{label}</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {valueLeading}
          <span className="truncate text-[0.9375rem] text-text-muted">{value}</span>
        </span>
        <CaretRightIcon aria-hidden className="size-4 shrink-0 text-text-faint" />
      </button>
    </li>
  )
}
