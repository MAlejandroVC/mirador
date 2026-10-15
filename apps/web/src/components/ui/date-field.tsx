import { addMonths, calendarWeeks, toCalendarDate } from '@repo/core'
import { type ReactNode, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocale } from '../../lib/format'
import { invalidRow } from './field-row'
import { CaretLeftIcon, CaretRightIcon } from './icons'

// DL-CMP-09: a date or a day of the month is never typed. The row shows the value in a
// tinted pill; tapping it opens a calendar (or the days 1 to 31) right under the row,
// as iOS forms do, and picking a day closes it again. Use these rows inside FieldRows.
// The picker opens and closes in place, growing to its height (DL-MOT-07).

/** The row under a field that holds its picker, open or folded away. */
function PickerRow({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <li
      id={id}
      className="fold"
      data-closed={open ? undefined : ''}
      aria-hidden={open ? undefined : true}
      inert={!open}
    >
      <div>
        <div className="px-2 pb-2">{children}</div>
      </div>
    </li>
  )
}

/** The first day of the week where the person lives: Sunday in Mexico and the US. */
function firstDayOfWeek(locale: string): number {
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number }
      weekInfo?: { firstDay: number }
    }
    const firstDay = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay
    return firstDay === undefined ? 0 : firstDay % 7
  } catch {
    return 0
  }
}

const atNoon = (date: string) => new Date(`${date}T12:00:00`)

function Pill({
  id,
  open,
  error,
  children,
  onToggle,
  describedBy,
}: {
  id: string
  open: boolean
  error?: boolean | undefined
  children: string
  onToggle: () => void
  describedBy: string
}) {
  return (
    <button
      id={id}
      type="button"
      aria-expanded={open}
      aria-controls={describedBy}
      // Read as "First charge, Oct 15, 2026".
      aria-labelledby={`${id}-label ${id}-value`}
      aria-invalid={error ? true : undefined}
      onClick={onToggle}
      className="group grid min-h-11 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-brand"
    >
      <span
        id={`${id}-value`}
        className={`rounded-lg bg-fill px-2.5 py-1.5 text-[0.9375rem] tabular-nums group-aria-invalid:text-warning ${
          open ? 'text-brand' : 'text-text'
        }`}
      >
        {children}
      </span>
    </button>
  )
}

export function DateRow({
  label,
  value,
  onChange,
  min,
  max,
  error,
}: {
  label: string
  /** YYYY-MM-DD, or '' when none is chosen yet. */
  value: string
  onChange: (date: string) => void
  min?: string
  max?: string
  error?: boolean
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const id = useId()
  const [open, setOpen] = useState(false)
  const shown = value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(atNoon(value))
    : t('pickers.choose')
  return (
    <>
      <li
        className={`flex min-h-[3.25rem] items-center gap-3 border-separator pr-2 pl-4 not-first:border-t ${invalidRow}`}
      >
        <span id={`${id}-label`} className="flex-1 text-[0.9375rem] text-text">
          {label}
        </span>
        <Pill
          id={id}
          open={open}
          error={error}
          describedBy={`${id}-picker`}
          onToggle={() => {
            setOpen(!open)
          }}
        >
          {shown}
        </Pill>
      </li>
      <PickerRow id={`${id}-picker`} open={open}>
        <Calendar
          value={value}
          label={label}
          {...(min ? { min } : {})}
          {...(max ? { max } : {})}
          onPick={(date) => {
            onChange(date)
            setOpen(false)
          }}
        />
      </PickerRow>
    </>
  )
}

/** A month at a time: the days as a grid, with the previous and next month a tap away. */
function Calendar({
  value,
  label,
  min,
  max,
  onPick,
}: {
  value: string
  label: string
  min?: string
  max?: string
  onPick: (date: string) => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const today = toCalendarDate(new Date())
  const [month, setMonth] = useState(`${(value || today).slice(0, 7)}-01`)
  const firstDay = firstDayOfWeek(locale)
  const weeks = calendarWeeks(month, firstDay)
  const previous = addMonths(month, -1)
  const next = addMonths(month, 1)
  const canGoBack = !min || previous.slice(0, 7) >= min.slice(0, 7)
  const canGoOn = !max || next.slice(0, 7) <= max.slice(0, 7)
  // The narrow weekday names, starting on the locale's first day: S M T W T F S.
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2023, 0, 1 + ((firstDay + index) % 7))),
    ),
  )
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    atNoon(month),
  )
  const dayLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'full' })
  return (
    <div role="group" aria-label={label} className="rounded-xl bg-surface p-2">
      <div className="flex items-center justify-between">
        <p
          aria-live="polite"
          className="pl-2 text-[0.9375rem] font-semibold first-letter:uppercase"
        >
          {monthName}
        </p>
        <div className="flex">
          <button
            type="button"
            aria-label={t('pickers.previousMonth')}
            disabled={!canGoBack}
            onClick={() => {
              setMonth(previous)
            }}
            className="grid size-11 place-items-center rounded-full text-brand focus-visible:outline-2 focus-visible:outline-brand disabled:text-text-faint"
          >
            <CaretLeftIcon aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            aria-label={t('pickers.nextMonth')}
            disabled={!canGoOn}
            onClick={() => {
              setMonth(next)
            }}
            className="grid size-11 place-items-center rounded-full text-brand focus-visible:outline-2 focus-visible:outline-brand disabled:text-text-faint"
          >
            <CaretRightIcon aria-hidden className="size-5" />
          </button>
        </div>
      </div>
      <div
        aria-hidden
        className="grid grid-cols-7 pb-1 text-center text-xs text-text-muted uppercase"
      >
        {weekdays.map((name, index) => (
          <span key={index}>{name}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((date, index) =>
          date === null ? (
            <span key={`blank-${String(index)}`} />
          ) : (
            <DayButton
              key={date}
              label={dayLabel.format(atNoon(date))}
              selected={date === value}
              today={date === today}
              disabled={(min !== undefined && date < min) || (max !== undefined && date > max)}
              onPick={() => {
                onPick(date)
              }}
            >
              {String(Number(date.slice(8)))}
            </DayButton>
          ),
        )}
      </div>
    </div>
  )
}

function DayButton({
  label,
  selected,
  today = false,
  disabled = false,
  onPick,
  children,
}: {
  label: string
  selected: boolean
  today?: boolean
  disabled?: boolean
  onPick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onPick}
      className="grid min-h-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      {/* The chosen day is a filled circle; today is in the brand color (as in iOS). */}
      <span
        className={`grid size-9 place-items-center rounded-full text-[1.0625rem] tabular-nums ${
          selected
            ? 'bg-brand font-semibold text-on-brand'
            : disabled
              ? 'text-text-faint'
              : today
                ? 'font-semibold text-brand'
                : 'text-text'
        }`}
      >
        {children}
      </span>
    </button>
  )
}

/** A day of the month, such as a statement's closing day: 1 to 31 in a grid. */
export function DayOfMonthRow({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: number | null
  onChange: (day: number) => void
  error?: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <>
      <li
        className={`flex min-h-[3.25rem] items-center gap-3 border-separator pr-2 pl-4 not-first:border-t ${invalidRow}`}
      >
        <span id={`${id}-label`} className="flex-1 text-[0.9375rem] text-text">
          {label}
        </span>
        <Pill
          id={id}
          open={open}
          error={error}
          describedBy={`${id}-picker`}
          onToggle={() => {
            setOpen(!open)
          }}
        >
          {value === null ? t('pickers.choose') : t('pickers.day', { day: value })}
        </Pill>
      </li>
      <PickerRow id={`${id}-picker`} open={open}>
        <div role="group" aria-label={label} className="grid grid-cols-7 rounded-xl bg-surface p-2">
          {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
            <DayButton
              key={day}
              label={t('pickers.day', { day })}
              selected={day === value}
              onPick={() => {
                onChange(day)
                setOpen(false)
              }}
            >
              {String(day)}
            </DayButton>
          ))}
        </div>
      </PickerRow>
    </>
  )
}
