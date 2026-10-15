import { CaretRightIcon } from './icons'
import { Link, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'

// DL-LAY-05, DL-CMP-07: rows sit in an inset list, a `surface` card with 16 px corners,
// introduced by an optional section label.
export function List({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      {/* DL-TYP-03: section label, 12 px uppercase in `text-muted`. */}
      {label && (
        <h2 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">{label}</h2>
      )}
      <ul className="overflow-hidden rounded-2xl bg-surface">{children}</ul>
    </section>
  )
}

const rowClass =
  'flex min-h-[3.25rem] w-full items-center gap-3 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand'

function RowBody({
  leading,
  title,
  subtitle,
  trailing,
  chevron,
  tone,
}: RowContent & { chevron?: boolean }) {
  return (
    <>
      {leading}
      {/* DL-SHP-04: the hairline between rows starts where the text starts. */}
      <span className="flex min-h-[3.25rem] flex-1 items-center gap-2 self-stretch border-t-[0.5px] border-separator py-2 pr-4 group-first:border-t-0">
        <span className="flex flex-1 flex-col">
          <span className={`text-[0.9375rem] ${tone === 'brand' ? 'text-brand' : 'text-text'}`}>
            {title}
          </span>
          {subtitle && <span className="text-[0.8125rem] text-text-muted">{subtitle}</span>}
        </span>
        {trailing}
        {/* DL-CMP-07: a chevron only when the row opens another screen. */}
        {chevron && <CaretRightIcon aria-hidden className="size-4 text-text-faint" />}
      </span>
    </>
  )
}

interface RowContent {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  /** `brand` for a row that is an action rather than a place, like Lock (DL-CMP-05, plain). */
  tone?: 'text' | 'brand'
}

export function ListRow(props: RowContent) {
  return (
    <li className="group">
      <div className={rowClass}>
        <RowBody {...props} />
      </div>
    </li>
  )
}

export function ListLinkRow({ to, ...props }: RowContent & { to: LinkProps['to'] }) {
  return (
    <li className="group">
      <Link to={to} className={rowClass}>
        <RowBody {...props} chevron />
      </Link>
    </li>
  )
}

export function ListButtonRow({
  onClick,
  disabled,
  ...props
}: RowContent & { onClick: () => void; disabled?: boolean }) {
  return (
    <li className="group">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`${rowClass} disabled:opacity-50`}
      >
        <RowBody tone="brand" {...props} />
      </button>
    </li>
  )
}
