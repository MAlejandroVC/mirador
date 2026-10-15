import type { ReactNode } from 'react'
import { CheckIcon } from './icons'

// A row that is on or off inside a form that needs Save, so a check rather than a
// switch (DL-CMP-10), as iOS does in its own pickers. `radio` when only one can be on.
export function ChoiceRow({
  title,
  subtitle,
  leading,
  checked,
  role = 'checkbox',
  onToggle,
}: {
  title: string
  subtitle?: string
  leading?: ReactNode
  checked: boolean
  role?: 'checkbox' | 'radio'
  onToggle: () => void
}) {
  return (
    <li className="group">
      <button
        type="button"
        role={role}
        aria-checked={checked}
        onClick={onToggle}
        className="flex min-h-[3.25rem] w-full items-center gap-3 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      >
        {leading}
        {/* DL-SHP-04: the hairline starts where the text starts. */}
        <span className="flex min-h-[3.25rem] flex-1 items-center gap-2 self-stretch border-t-[0.5px] border-separator py-2 pr-4 group-first:border-t-0">
          <span className="flex flex-1 flex-col">
            <span className="text-[0.9375rem] text-text">{title}</span>
            {subtitle && <span className="text-[0.8125rem] text-text-muted">{subtitle}</span>}
          </span>
          <CheckIcon
            aria-hidden
            weight="bold"
            className={`size-5 shrink-0 text-brand ${checked ? '' : 'invisible'}`}
          />
        </span>
      </button>
    </li>
  )
}
