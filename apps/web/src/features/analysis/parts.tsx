import type { SliceBy } from '@repo/core'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { rowClass } from '../../components/ui/row'
import { CaretDownIcon, CaretLeftIcon, CaretRightIcon, type Icon } from '../../components/ui/icons'
import type { TransactionsSearch } from '../transactions'

/** DL-LAY-05: a `surface` card with 16 px corners. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-surface p-4 ${className}`}>{children}</section>
}

/** DL-TYP-03: a section label above a card. */
export function SectionLabel({ children, detail }: { children: ReactNode; detail?: ReactNode }) {
  return (
    <div className="-mb-1.5 flex items-baseline justify-between gap-3 px-4 pt-2">
      <h2 className="text-xs tracking-[0.04em] text-text-muted uppercase">{children}</h2>
      {detail && <span className="text-xs text-text-muted tabular-nums">{detail}</span>}
    </div>
  )
}

/** ANA-30: "28% above usual" in `warning` once past the threshold (DL-COL-05). */
export function Versus({ versus }: { versus: { text: string; flagged: boolean } | null }) {
  if (!versus) return null
  return <span className={versus.flagged ? 'text-warning' : undefined}>{versus.text}</span>
}

/** DL-CMP-07: a row that opens a slice's own screen (ANA-10 drill-down). */
export function SliceLink({
  by,
  id,
  leading,
  title,
  subtitle,
  trailing,
}: {
  by: SliceBy
  id: string
  leading: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <li className="group">
      <Link to="/budget/$by/$id" params={{ by, id }} className={rowClass}>
        {leading}
        <span className="flex min-h-[3.25rem] min-w-0 flex-1 items-center gap-2 self-stretch border-t-[0.5px] border-separator py-2 pr-4 group-first:border-t-0">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[0.9375rem] text-text">{title}</span>
            {subtitle && <span className="text-[0.8125rem] text-text-muted">{subtitle}</span>}
          </span>
          {trailing}
          <CaretRightIcon aria-hidden className="size-4 shrink-0 text-text-faint" />
        </span>
      </Link>
    </li>
  )
}

/** A plain row with a value, for figures that open nothing (DL-CMP-07: no chevron). */
export function FigureRow({
  leading,
  title,
  subtitle,
  trailing,
}: {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <li className="group flex min-h-[3.25rem] items-center gap-3 pl-4">
      {leading}
      <span className="flex min-h-[3.25rem] min-w-0 flex-1 items-center gap-2 self-stretch border-t-[0.5px] border-separator py-2 pr-4 group-first:border-t-0">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[0.9375rem] text-text">{title}</span>
          {subtitle && <span className="text-[0.8125rem] text-text-muted">{subtitle}</span>}
        </span>
        {trailing}
      </span>
    </li>
  )
}

/**
 * A question tile: the question, the answer as a big figure, one line of context and
 * an optional small visual, opening the screen that answers it in full.
 */
export function QuestionTile({
  to,
  search,
  question,
  answer,
  detail,
  visual,
}: {
  to: '/budget/when' | '/budget/coming' | '/budget/where' | '/budget/cut' | '/budget/trends'
  search?: { by?: SliceBy }
  question: string
  answer: ReactNode
  detail: ReactNode
  visual?: ReactNode
}) {
  return (
    <Link
      to={to}
      {...(search ? { search } : {})}
      className="flex min-h-[9.5rem] min-w-0 flex-col gap-1 rounded-2xl bg-surface p-3.5 active:bg-fill focus-visible:outline-2 focus-visible:outline-brand"
    >
      <span className="flex items-center justify-between gap-1 text-[0.8125rem] font-semibold text-text-muted">
        <span>{question}</span>
        <CaretRightIcon aria-hidden className="size-3.5 shrink-0 text-text-faint" />
      </span>
      <span className="truncate text-[1.375rem] leading-tight font-semibold tracking-[-0.01em] text-text">
        {answer}
      </span>
      <span className="text-[0.8125rem] text-text-muted">{detail}</span>
      {visual && <span className="mt-auto pt-1">{visual}</span>}
    </Link>
  )
}

/** ANA-02: the period shown, with the ones before and after, as on Transactions. */
export function PeriodControl({
  name,
  subtitle,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  onPick,
  nextDisabled,
}: {
  name: string
  subtitle?: string
  previousLabel: string
  nextLabel: string
  onPrevious: () => void
  onNext: () => void
  onPick: () => void
  nextDisabled?: boolean
}) {
  const arrow = (icon: Icon, label: string, onClick: () => void, disabled?: boolean) => {
    const IconComponent = icon
    return (
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className="grid size-11 shrink-0 place-items-center rounded-xl text-brand focus-visible:outline-2 focus-visible:outline-brand disabled:text-text-faint"
      >
        <IconComponent aria-hidden className="size-5" />
      </button>
    )
  }
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-surface p-1">
      {arrow(CaretLeftIcon, previousLabel, onPrevious)}
      <button
        type="button"
        onClick={onPick}
        className="flex min-h-11 flex-1 flex-col items-center justify-center rounded-xl py-1 focus-visible:outline-2 focus-visible:outline-brand"
      >
        <span className="flex items-center gap-1 text-[1.0625rem] font-semibold text-text">
          {name}
          <CaretDownIcon aria-hidden className="size-3.5 text-text-muted" />
        </span>
        {subtitle && <span className="text-[0.8125rem] text-text-muted">{subtitle}</span>}
      </button>
      {arrow(CaretRightIcon, nextLabel, onNext, nextDisabled)}
    </div>
  )
}

/** ANA-04: a row that opens the transaction list on what a figure counts. */
export function TransactionsLink({ search, title }: { search: TransactionsSearch; title: string }) {
  return (
    <li className="group">
      <Link to="/transactions" search={search} className={rowClass}>
        <span className="flex min-h-[3.25rem] min-w-0 flex-1 items-center gap-2 self-stretch py-2 pr-4">
          <span className="flex-1 text-[0.9375rem] text-brand">{title}</span>
          <CaretRightIcon aria-hidden className="size-4 shrink-0 text-text-faint" />
        </span>
      </Link>
    </li>
  )
}
