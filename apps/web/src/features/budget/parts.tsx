import type { GoalKind } from '@repo/core'
import { Link, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { IconTile } from '../../components/ui/icon-tile'
import { CaretRightIcon } from '../../components/ui/icons'
import { rowClass } from '../../components/ui/row'
import { type MarkColor, softColor } from '../analysis/chart-colors'
import { goalIcons } from './goal-icons'

// What the budget's screens share: goal tiles, progress bars and the rows that carry
// them.

/** DL-COL-09: a goal's tile is `sun`, which marks goals and nothing else. */
export function GoalTile({ kind, size }: { kind: GoalKind; size?: 'regular' | 'large' }) {
  return <IconTile icon={goalIcons[kind]} color="sun" {...(size ? { size } : {})} />
}

/** DL-VIZ-01, DL-COL-06: progress as a bar in its color's softer tone; 0 to 1. */
export function ProgressBar({ value, color }: { value: number; color: MarkColor }) {
  const width = Math.max(0, Math.min(1, value)) * 100
  return (
    <span aria-hidden className="block h-[5px] overflow-hidden rounded-full bg-fill">
      <span
        className="block h-full rounded-full"
        style={{ width: `${String(width)}%`, backgroundColor: softColor(color) }}
      />
    </span>
  )
}

/**
 * DL-CMP-07: a row with a bar under its name, such as a category's plan or a goal: the
 * name and a value on the first line, the bar, then a line of context. It opens the
 * item's own screen, so it ends in a chevron.
 */
export function ProgressRow({
  to,
  params,
  search,
  leading,
  title,
  value,
  bar,
  note,
}: {
  to: LinkProps['to']
  params?: LinkProps['params']
  search?: LinkProps['search']
  leading: ReactNode
  title: ReactNode
  value?: ReactNode
  bar?: ReactNode
  note?: ReactNode
}) {
  return (
    <li className="group">
      <Link to={to} params={params} search={search} className={rowClass}>
        {leading}
        {/* DL-SHP-04: the hairline starts where the text starts. */}
        <span className="flex min-h-[3.75rem] min-w-0 flex-1 items-center gap-2 self-stretch border-t-[0.5px] border-separator py-2.5 pr-4 group-first:border-t-0">
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[0.9375rem] text-text">{title}</span>
              {value && (
                <span className="shrink-0 text-[0.8125rem] text-text-muted tabular-nums">
                  {value}
                </span>
              )}
            </span>
            {bar}
            {note && <span className="text-[0.8125rem] text-text-muted">{note}</span>}
          </span>
          <CaretRightIcon aria-hidden className="size-4 shrink-0 text-text-faint" />
        </span>
      </Link>
    </li>
  )
}

/** DL-PAT-05 for money: "$180 over" in `warning`, the only color overspending gets. */
export function Over({ children }: { children: ReactNode }) {
  return <span className="text-warning">{children}</span>
}
