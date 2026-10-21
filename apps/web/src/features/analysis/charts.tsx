import { calendarWeeks } from '@repo/core'
import type { CSSProperties, ReactNode } from 'react'
import { fullColor, type MarkColor, softColor } from './chart-colors'
import { columnAt, holdable, nearestPoint, type Tip, useChartPointer } from './chart-pointer'
import { ChartRule, ChartTip } from './chart-tip'

// Epic 5's charts: flat SVG and CSS, no library, so nothing leaves the device and the
// bundle stays small. DL-VIZ-02: a chart about categories, wallets or tags takes their
// colors; one with a single series takes `brand`. DL-COL-06: bars take the softer tone.
// DL-VIZ-04: flat, with the one gradient allowed: the area under a line, fading out.
// DL-VIZ-05: with `tip`, a chart shows what is at the mouse, or under a finger that
// touches and holds it, in a callout; the screen says what the callout reads.

/** A point on a line, drawn over the chart in HTML so it stays round as the SVG stretches. */
function Dot({ left, top, tone }: { left: number; top: number; tone: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${tone}`}
      style={{ left: `${String(left)}%`, top: `${String(top)}%` }}
    />
  )
}

/** One part of a stacked bar. */
export interface Part {
  key: string
  value: number
  color: MarkColor
  strength?: number
}

/**
 * ANA-10, ANA-13: one bar split by share, largest first, at most 6 parts plus Other.
 * Looking at a part fades the others, as Swift Charts does with a pie's sectors.
 */
export function StackedBar({
  parts,
  height = 12,
  tip,
}: {
  parts: readonly Part[]
  height?: number
  tip?: (part: Part, share: number) => Tip
}) {
  const shown = parts.filter((part) => part.value > 0)
  const total = shown.reduce((sum, part) => sum + part.value, 0)
  const starts = shown.map(
    (_, index) => shown.slice(0, index).reduce((sum, part) => sum + part.value, 0) / total,
  )
  const { attach, active: pointed } = useChartPointer((x, _y, box) => {
    if (!tip || total <= 0 || box.width <= 0) return null
    const fraction = Math.min(1, Math.max(0, (x - box.left) / box.width))
    return starts.findLastIndex((start) => start <= fraction)
  })
  if (total <= 0) return <div aria-hidden className="h-3 rounded-full bg-fill" />
  const active = pointed === null ? undefined : shown[pointed]
  const activeStart = pointed === null ? 0 : (starts[pointed] ?? 0)
  return (
    // The padding gives a finger more room to hold the thin bar, without moving it.
    <div ref={attach} className={`relative -my-2 py-2 ${tip ? holdable : ''}`}>
      <div aria-hidden className="flex gap-0.5 overflow-hidden rounded-full" style={{ height }}>
        {shown.map((part) => (
          <div
            key={part.key}
            className="min-w-1"
            style={{
              flexGrow: part.value,
              flexBasis: 0,
              backgroundColor: softColor(part.color, part.strength),
              opacity: active && active.key !== part.key ? 0.35 : 1,
            }}
          />
        ))}
      </div>
      {active && tip && (
        <ChartTip
          left={(activeStart + active.value / total / 2) * 100}
          tip={tip(active, active.value / total)}
        />
      )}
    </div>
  )
}

const chartHeight = 120

/**
 * ANA-21: spending through the period, day by day, against the usual period's curve
 * (dashed) and, when the period has a budget, the budget's even daily pace (BUD-78, a
 * thin solid straight line).
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
  tip,
}: {
  current: readonly number[]
  usual: readonly number[]
  budget?: readonly number[]
  days: number
  label: string
  /** Under the chart: the first and last day, and today while the period runs. */
  dates: { start: string; end: string; today?: string }
  /** What the callout says about a day, counted from 0. */
  tip?: (day: number) => Tip
}) {
  const { attach, active: pointed } = useChartPointer((left, _top, box) =>
    tip ? nearestPoint(left, box, days) : null,
  )
  const top = Math.max(1, ...current, ...usual, ...budget) * 1.08
  const width = 300
  const x = (day: number) => (days <= 1 ? 0 : (day / (days - 1)) * width)
  const y = (value: number) => chartHeight - (Math.max(0, value) / top) * chartHeight
  const line = (values: readonly number[]) =>
    values.map((value, day) => `${x(day).toFixed(1)},${y(value).toFixed(1)}`).join(' ')
  const last = current.length - 1
  const across = (day: number) => (x(day) / width) * 100
  const down = (value: number) => ((y(value) + 4) / (chartHeight + 8)) * 100
  const todayAt = last >= 0 ? across(last) : null
  const day = pointed
  // Today's date shows under its dot only where it clears the first and last day.
  const todayLabel = dates.today && todayAt !== null && todayAt > 20 && todayAt < 80
  return (
    <div className="flex flex-col gap-1.5">
      <div ref={attach} className={`relative ${tip ? holdable : ''}`}>
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
        {day !== null && tip && <ChartRule left={across(day)} />}
        {dates.today && todayAt !== null && (
          <Dot left={todayAt} top={down(current[last] ?? 0)} tone="bg-brand" />
        )}
        {day !== null && tip && (
          <>
            {usual[day] !== undefined && (
              <Dot left={across(day)} top={down(usual[day])} tone="bg-text-faint" />
            )}
            {budget[day] !== undefined && (
              <Dot left={across(day)} top={down(budget[day])} tone="bg-text-muted" />
            )}
            {current[day] !== undefined && (
              <Dot left={across(day)} top={down(current[day])} tone="bg-brand" />
            )}
            <ChartTip left={across(day)} tip={tip(day)} />
          </>
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
 * draws the budget. With `onSelect`, each column is a button (ANA-04). The column being
 * looked at is drawn in full color under its callout.
 */
export function ColumnChart({
  columns,
  average,
  target,
  color = 'brand',
  onSelect,
  height = 'h-28',
  tip,
}: {
  columns: readonly Column[]
  average?: number | null
  target?: number | null
  color?: MarkColor
  onSelect?: (column: Column) => void
  height?: string
  tip?: (column: Column) => Tip
}) {
  const {
    attach,
    active: pointed,
    show,
  } = useChartPointer((left, _top, box) => (tip ? columnAt(left, box, columns.length) : null))
  const active = pointed === null ? undefined : columns[pointed]
  const top = Math.max(1, ...columns.map((column) => column.value), average ?? 0, target ?? 0)
  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={attach}
        className={`relative flex items-end gap-1 ${height} ${tip ? holdable : ''}`}
      >
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
        {columns.map((column, index) => {
          const style: CSSProperties = {
            height: `${String(Math.max(column.value > 0 ? 3 : 0, (column.value / top) * 100))}%`,
            backgroundColor: column.muted
              ? softColor('other')
              : column.highlight || column === active
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
              onFocus={(event) => {
                // DL-VIZ-05: a column reached with the keyboard shows its callout too.
                if (tip && event.currentTarget.matches(':focus-visible')) show(index)
              }}
              onBlur={() => {
                show(null)
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
        {active && tip && pointed !== null && (
          <ChartTip left={((pointed + 0.5) / columns.length) * 100} tip={tip(active)} />
        )}
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
  tip,
}: {
  lines: readonly { values: readonly (number | null)[]; style: 'solid' | 'dashed' | 'muted' }[]
  label: string
  footer?: ReactNode
  /** What the callout says about a point, counted from 0; null for nothing there. */
  tip?: (index: number) => Tip | null
}) {
  const count = Math.max(0, ...lines.map((line) => line.values.length))
  const { attach, active: pointed } = useChartPointer((left, _top, box) =>
    tip ? nearestPoint(left, box, count) : null,
  )
  const all = lines.flatMap((line) =>
    line.values.filter((value): value is number => value !== null),
  )
  if (all.length === 0) return null
  const low = Math.min(0, ...all)
  const high = Math.max(1, ...all)
  const span = (high - low) * 1.08 || 1
  const width = 300
  const x = (index: number) => (count <= 1 ? 0 : (index / (count - 1)) * width)
  const y = (value: number) => chartHeight - ((value - low) / span) * chartHeight
  const at = pointed
  const shown = at === null || !tip ? null : tip(at)
  const across = (index: number) => (x(index) / width) * 100
  return (
    <div className="flex flex-col gap-1.5">
      <div ref={attach} className={`relative ${tip ? holdable : ''}`}>
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 -4 ${String(width)} ${String(chartHeight + 8)}`}
          preserveAspectRatio="none"
          className="block h-32 w-full overflow-visible"
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
                stroke={
                  line.style === 'muted' ? 'var(--mirador-text-muted)' : 'var(--mirador-brand)'
                }
                strokeWidth={line.style === 'solid' ? 2.5 : 1.75}
                strokeDasharray={line.style === 'solid' ? undefined : '4 4'}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </svg>
        {at !== null && shown && (
          <>
            <ChartRule left={across(at)} />
            {lines.map((line, index) => {
              const value = line.values[at]
              return value == null ? null : (
                <Dot
                  key={index}
                  left={across(at)}
                  top={((y(value) + 4) / (chartHeight + 8)) * 100}
                  tone={line.style === 'muted' ? 'bg-text-muted' : 'bg-brand'}
                />
              )
            })}
            <ChartTip left={across(at)} tip={shown} />
          </>
        )}
      </div>
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
  tip,
}: {
  /** Any date in the month. */
  month: string
  daily: ReadonlyMap<string, number>
  today: string
  /** Narrow weekday names, Sunday first. */
  weekdays: readonly string[]
  describe: (date: string, spent: number) => string
  onSelect: (date: string) => void
  tip?: (date: string, spent: number) => Tip
}) {
  // The day under the pointer, from the cell itself, since the calendar is a grid.
  const {
    attach,
    active: pointed,
    show,
  } = useChartPointer((left, top) => {
    const cell = tip
      ? document.elementFromPoint(left, top)?.closest<HTMLElement>('[data-day]')
      : null
    return cell ? Number(cell.dataset.day) : null
  })
  const spent = [...daily.values()].filter((value) => value > 0).sort((a, b) => a - b)
  const step = (value: number) => {
    if (value <= 0 || spent.length === 0) return 0
    const rank = spent.findIndex((each) => each >= value)
    return 1 + Math.min(3, Math.floor((rank / spent.length) * 4))
  }
  const weeks = calendarWeeks(month, 0)
  return (
    <div ref={attach} className={`grid grid-cols-7 gap-1 ${tip ? holdable : ''}`}>
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
        const looked = pointed === index && tip
        return (
          <button
            key={date}
            type="button"
            disabled={future}
            aria-label={describe(date, value)}
            {...(future ? {} : { 'data-day': index })}
            onClick={() => {
              onSelect(date)
            }}
            onFocus={(event) => {
              if (tip && event.currentTarget.matches(':focus-visible')) show(index)
            }}
            onBlur={() => {
              show(null)
            }}
            className={`relative flex aspect-square min-h-9 items-center justify-center rounded-lg text-[0.75rem] tabular-nums focus-visible:outline-2 focus-visible:outline-brand ${
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
            {/* Anchored by its weekday, so the callout stays within the calendar. */}
            {looked && <ChartTip left={((index % 7) / 6) * 100} tip={tip(date, value)} />}
          </button>
        )
      })}
    </div>
  )
}
