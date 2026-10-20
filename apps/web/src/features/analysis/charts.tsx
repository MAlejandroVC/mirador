import { calendarWeeks } from '@repo/core'
import type { CSSProperties, ReactNode } from 'react'
import { fullColor, type MarkColor, softColor } from './chart-colors'

// Epic 5's charts: flat SVG and CSS, no library, so nothing leaves the device and the
// bundle stays small. DL-VIZ-02: a chart about categories, wallets or tags takes their
// colors; one with a single series takes `brand`. DL-COL-06: bars take the softer tone.
// DL-VIZ-04: flat, with the one gradient allowed: the area under a line, fading out.

/** ANA-10, ANA-13: one bar split by share, largest first, at most 6 parts plus Other. */
export function StackedBar({
  parts,
  height = 12,
}: {
  parts: readonly { key: string; value: number; color: MarkColor; strength?: number }[]
  height?: number
}) {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0)
  if (total <= 0) return <div aria-hidden className="h-3 rounded-full bg-fill" />
  return (
    <div aria-hidden className="flex gap-0.5 overflow-hidden rounded-full" style={{ height }}>
      {parts
        .filter((part) => part.value > 0)
        .map((part) => (
          <div
            key={part.key}
            className="min-w-1"
            style={{
              flexGrow: part.value,
              flexBasis: 0,
              backgroundColor: softColor(part.color, part.strength),
            }}
          />
        ))}
    </div>
  )
}

const chartHeight = 120

/**
 * ANA-21: spending through the period, day by day, against the usual period's curve
 * (dashed) and, when the period has a budget, the budget's pace (BUD-42, thin solid).
 * Each point is the total at the end of its day, so the line starts on the first day's
 * spending, not at nothing; the dates under it say so. Today's point is marked.
 */
export function PaceChart({
  current,
  usual,
  budget = [],
  days,
  label,
  dates,
}: {
  current: readonly number[]
  usual: readonly number[]
  budget?: readonly number[]
  days: number
  label: string
  /** Under the chart: the first and last day, and today while the period runs. */
  dates: { start: string; end: string; today?: string }
}) {
  const top = Math.max(1, ...current, ...usual, ...budget) * 1.08
  const width = 300
  const x = (day: number) => (days <= 1 ? 0 : (day / (days - 1)) * width)
  const y = (value: number) => chartHeight - (Math.max(0, value) / top) * chartHeight
  const line = (values: readonly number[]) =>
    values.map((value, day) => `${x(day).toFixed(1)},${y(value).toFixed(1)}`).join(' ')
  const last = current.length - 1
  // The SVG stretches to the card, so today's dot sits over it in HTML and stays round.
  const todayAt = last >= 0 ? (x(last) / width) * 100 : null
  const todayTop = last >= 0 ? ((y(current[last] ?? 0) + 4) / (chartHeight + 8)) * 100 : null
  // Today's date shows under its dot only where it clears the first and last day.
  const todayLabel = dates.today && todayAt !== null && todayAt > 20 && todayAt < 80
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 -4 ${String(width)} ${String(chartHeight + 8)}`}
          preserveAspectRatio="none"
          className="block h-32 w-full overflow-visible"
        >
          <defs>
            <linearGradient id="pace-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--mirador-brand)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--mirador-brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {usual.length > 0 && (
            <polyline
              points={line(usual)}
              fill="none"
              stroke="var(--mirador-text-faint)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {last >= 0 && (
            <polygon
              points={`0,${String(chartHeight)} ${line(current)} ${x(last).toFixed(1)},${String(chartHeight)}`}
              fill="url(#pace-fill)"
            />
          )}
          {budget.length > 0 && (
            <polyline
              points={line(budget)}
              fill="none"
              stroke="var(--mirador-text-muted)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {last >= 0 && (
            <polyline
              points={line(current)}
              fill="none"
              stroke="var(--mirador-brand)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {dates.today && todayAt !== null && todayTop !== null && (
          <span
            aria-hidden
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-surface"
            style={{ left: `${String(todayAt)}%`, top: `${String(todayTop)}%` }}
          />
        )}
      </div>
      <div aria-hidden className="relative h-4 text-[0.6875rem] text-text-muted tabular-nums">
        <span className="absolute left-0">{dates.start}</span>
        {todayLabel && (
          <span
            className="absolute -translate-x-1/2 font-semibold text-text"
            style={{ left: `${String(todayAt)}%` }}
          >
            {dates.today}
          </span>
        )}
        <span className="absolute right-0">{dates.end}</span>
      </div>
    </div>
  )
}

/** One column of a column chart. */
export interface Column {
  key: string
  /** Under the column, short: "Mon", "Oct". */
  label: string
  value: number
  /** What a screen reader hears, with the amount. */
  description: string
  /** Drawn in full color: the one being looked at. */
  highlight?: boolean
  /** Drawn in `text-faint`: left out of what the chart is about, such as a month (BUD-03). */
  muted?: boolean
}

/**
 * ANA-11, ANA-22, ANA-27: columns with their labels under them and, optionally, the
 * average as a dashed line and a target as a thin solid one (BUD-77), as the pace chart
 * draws the budget. With `onSelect`, each column is a button (ANA-04).
 */
export function ColumnChart({
  columns,
  average,
  target,
  color = 'brand',
  onSelect,
  height = 'h-28',
}: {
  columns: readonly Column[]
  average?: number | null
  target?: number | null
  color?: MarkColor
  onSelect?: (column: Column) => void
  height?: string
}) {
  const top = Math.max(1, ...columns.map((column) => column.value), average ?? 0, target ?? 0)
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`relative flex items-end gap-1 ${height}`}>
        {average != null && average > 0 && (
          <div
            aria-hidden
            className="absolute inset-x-0 border-t-[1.5px] border-dashed border-text-faint"
            style={{ bottom: `${String((average / top) * 100)}%` }}
          />
        )}
        {target != null && target > 0 && (
          <div
            aria-hidden
            className="absolute inset-x-0 z-10 border-t-[1.5px] border-text-muted"
            style={{ bottom: `${String((target / top) * 100)}%` }}
          />
        )}
        {columns.map((column) => {
          const style: CSSProperties = {
            height: `${String(Math.max(column.value > 0 ? 3 : 0, (column.value / top) * 100))}%`,
            backgroundColor: column.muted
              ? softColor('other')
              : column.highlight
                ? fullColor(color)
                : softColor(color),
          }
          const bar = <span className="block w-full rounded-t-[0.3125rem]" style={style} />
          return onSelect ? (
            <button
              key={column.key}
              type="button"
              aria-label={column.description}
              onClick={() => {
                onSelect(column)
              }}
              className="flex h-full min-w-0 flex-1 items-end rounded-md focus-visible:outline-2 focus-visible:outline-brand"
            >
              {bar}
            </button>
          ) : (
            <span key={column.key} className="flex h-full min-w-0 flex-1 items-end">
              <span className="sr-only">{column.description}</span>
              {bar}
            </span>
          )
        })}
      </div>
      <div aria-hidden className="flex gap-1">
        {columns.map((column) => (
          <span
            key={column.key}
            className={`min-w-0 flex-1 truncate text-center text-[0.6875rem] ${
              column.highlight ? 'font-semibold text-text' : 'text-text-muted'
            }`}
          >
            {column.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** A small line for a tile: the shape of a trend, nothing to read off. */
export function Sparkline({ values }: { values: readonly number[] }) {
  if (values.length < 2) return null
  const low = Math.min(...values)
  const high = Math.max(...values)
  const span = high - low || 1
  const points = values
    .map(
      (value, index) =>
        `${((index / (values.length - 1)) * 140).toFixed(1)},${(28 - ((value - low) / span) * 24).toFixed(1)}`,
    )
    .join(' ')
  return (
    <svg aria-hidden viewBox="0 0 140 30" preserveAspectRatio="none" className="h-7 w-full">
      <polyline
        points={points}
        fill="none"
        stroke="var(--mirador-brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/**
 * ANA-16, ANA-25, ANA-40: lines over periods. `solid` points are history, `dashed` a
 * projection or a comparison; a value of null leaves a gap.
 */
export function LineChart({
  lines,
  label,
  footer,
}: {
  lines: readonly { values: readonly (number | null)[]; style: 'solid' | 'dashed' | 'muted' }[]
  label: string
  footer?: ReactNode
}) {
  const all = lines.flatMap((line) =>
    line.values.filter((value): value is number => value !== null),
  )
  if (all.length === 0) return null
  const low = Math.min(0, ...all)
  const high = Math.max(1, ...all)
  const span = (high - low) * 1.08 || 1
  const count = Math.max(...lines.map((line) => line.values.length))
  const width = 300
  const x = (index: number) => (count <= 1 ? 0 : (index / (count - 1)) * width)
  const y = (value: number) => chartHeight - ((value - low) / span) * chartHeight
  return (
    <div className="flex flex-col gap-1.5">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 -4 ${String(width)} ${String(chartHeight + 8)}`}
        preserveAspectRatio="none"
        className="h-32 w-full overflow-visible"
      >
        {low < 0 && (
          <line
            x1="0"
            x2={width}
            y1={y(0)}
            y2={y(0)}
            stroke="var(--mirador-separator)"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {lines.map((line, index) => {
          const points = line.values
            .map((value, at) =>
              value === null ? null : `${x(at).toFixed(1)},${y(value).toFixed(1)}`,
            )
            .filter((point) => point !== null)
            .join(' ')
          return (
            <polyline
              key={index}
              points={points}
              fill="none"
              stroke={line.style === 'muted' ? 'var(--mirador-text-muted)' : 'var(--mirador-brand)'}
              strokeWidth={line.style === 'solid' ? 2.5 : 1.75}
              strokeDasharray={line.style === 'solid' ? undefined : '4 4'}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
      </svg>
      {footer}
    </div>
  )
}

/**
 * ANA-20: a calendar of the period with each day shaded by what was spent, in five
 * steps of `brand` from none to the most. Days still to come are left blank.
 */
export function Heatmap({
  month,
  daily,
  today,
  weekdays,
  describe,
  onSelect,
}: {
  /** Any date in the month. */
  month: string
  daily: ReadonlyMap<string, number>
  today: string
  /** Narrow weekday names, Sunday first. */
  weekdays: readonly string[]
  describe: (date: string, spent: number) => string
  onSelect: (date: string) => void
}) {
  const spent = [...daily.values()].filter((value) => value > 0).sort((a, b) => a - b)
  const step = (value: number) => {
    if (value <= 0 || spent.length === 0) return 0
    const rank = spent.findIndex((each) => each >= value)
    return 1 + Math.min(3, Math.floor((rank / spent.length) * 4))
  }
  const weeks = calendarWeeks(month, 0)
  return (
    <div className="grid grid-cols-7 gap-1">
      {weekdays.map((name, index) => (
        <span key={index} aria-hidden className="text-center text-[0.6875rem] text-text-muted">
          {name}
        </span>
      ))}
      {weeks.flat().map((date, index) => {
        if (date === null) return <span key={`blank ${String(index)}`} />
        const value = daily.get(date) ?? 0
        const level = step(value)
        const future = date > today
        return (
          <button
            key={date}
            type="button"
            disabled={future}
            aria-label={describe(date, value)}
            onClick={() => {
              onSelect(date)
            }}
            className={`flex aspect-square min-h-9 items-center justify-center rounded-lg text-[0.75rem] tabular-nums focus-visible:outline-2 focus-visible:outline-brand ${
              future ? 'text-text-faint' : level >= 3 ? 'text-on-brand' : 'text-text'
            } ${date === today ? 'ring-2 ring-brand ring-offset-1 ring-offset-surface' : ''}`}
            style={{
              backgroundColor: future
                ? 'transparent'
                : level === 0
                  ? 'var(--mirador-fill)'
                  : `color-mix(in srgb, var(--mirador-brand) ${String([0, 22, 45, 72, 100][level] ?? 0)}%, var(--mirador-surface))`,
            }}
          >
            {Number(date.slice(8))}
          </button>
        )
      })}
    </div>
  )
}
