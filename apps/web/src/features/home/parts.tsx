import { Link, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { CaretRightIcon } from '../../components/ui/icons'

/** DL-LAY-05: a whole card that opens another screen (DSH-08). */
export const cardLinkClass =
  'block rounded-2xl bg-surface active:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/** DL-TYP-03: a Home card under its section label, as a list has it (DL-LAY-05). */
export function HomeSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">{label}</h2>
      {children}
    </section>
  )
}

/**
 * DL-CMP-07, DL-CMP-15: the last row of a Home card, "See more" in `brand`, opening the
 * screen that shows all of it, so it has a chevron.
 */
export function MoreRow({
  to,
  search,
  children,
}: {
  to: LinkProps['to']
  search?: LinkProps['search']
  children: ReactNode
}) {
  return (
    <li className="group">
      <Link
        to={to}
        search={search}
        className="flex min-h-11 w-full items-center gap-2 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      >
        <span className="flex min-h-11 flex-1 items-center gap-2 self-stretch border-t-[0.5px] border-separator pr-4 group-first:border-t-0">
          <span className="flex-1 text-[0.9375rem] text-brand">{children}</span>
          <CaretRightIcon aria-hidden className="size-4 text-text-faint" />
        </span>
      </Link>
    </li>
  )
}

/** A line of muted text at the foot of a list, such as Coming up's totals. */
export function NoteRow({ children }: { children: ReactNode }) {
  return (
    <li className="group pl-4">
      <p className="border-t-[0.5px] border-separator py-3 pr-4 text-[0.8125rem] text-text-muted group-first:border-t-0">
        {children}
      </p>
    </li>
  )
}
