import type { ReactNode } from 'react'
import { CheckIcon } from './icons'

// A row that is on or off (DL-CMP-10). `switch` for a single option that is on or off,
// such as "Leave out of the budget", even in a form that needs Save, as in iOS's own
// New Event sheet. A check for picking from a list: `radio` when only one can be
// chosen, `checkbox` when several can.
// In a list that folds (DL-CMP-15), `folded` hides the row in place, shrinking it away
// (DL-MOT-07), and `separator` says whether the hairline above it shows, since the first
// row in view isn't always the first in the list.
export function ChoiceRow({
  title,
  subtitle,
  leading,
  checked,
  role = 'checkbox',
  folded,
  separator,
  onToggle,
}: {
  title: string
  subtitle?: string
  leading?: ReactNode
  checked: boolean
  role?: 'checkbox' | 'radio' | 'switch'
  folded?: boolean
  separator?: boolean
  onToggle: () => void
}) {
  const hairline =
    separator === undefined
      ? 'border-t-[0.5px] group-first:border-t-0'
      : separator
        ? 'border-t-[0.5px]'
        : ''
  const row = (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      onClick={onToggle}
      className="flex min-h-[3.25rem] w-full items-center gap-3 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      {leading}
      {/* DL-SHP-04: the hairline starts where the text starts. */}
      <span
        className={`flex min-h-[3.25rem] flex-1 items-center gap-2 self-stretch border-separator py-2 pr-4 ${hairline}`}
      >
        <span className="flex flex-1 flex-col">
          <span className="text-[0.9375rem] text-text">{title}</span>
          {subtitle && <span className="text-[0.8125rem] text-text-muted">{subtitle}</span>}
        </span>
        {role === 'switch' ? (
          <span aria-hidden className="switch" data-on={checked ? '' : undefined} />
        ) : (
          <CheckIcon
            aria-hidden
            weight="bold"
            className={`size-5 shrink-0 text-brand ${checked ? '' : 'invisible'}`}
          />
        )}
      </span>
    </button>
  )
  if (folded === undefined) return <li className="group">{row}</li>
  return (
    <li
      className="group fold"
      data-closed={folded ? '' : undefined}
      aria-hidden={folded || undefined}
      inert={folded}
    >
      <div>{row}</div>
    </li>
  )
}
