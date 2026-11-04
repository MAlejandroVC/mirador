import type { Tip } from './chart-pointer'

/**
 * DL-VIZ-05, DL-SHP-03: the callout, floating just above `top` (the top of the chart
 * unless given) at `left` percent across it. It shifts sideways by the same share of
 * its width, so it stays within the chart's width at both ends, as Swift Charts does.
 */
export function ChartTip({ left, top = '0px', tip }: { left: number; top?: string; tip: Tip }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-20 flex w-max text-left max-w-full min-w-24 flex-col gap-0.5 rounded-xl border-[0.5px] border-separator bg-surface px-2.5 py-1.5 shadow-[0_4px_14px_rgb(0_0_0/12%)]"
      style={{
        left: `${String(left)}%`,
        top,
        transform: `translate(-${String(left)}%, calc(-100% - 0.375rem))`,
      }}
    >
      <span className="text-[0.75rem] text-text-muted tabular-nums">{tip.title}</span>
      {tip.rows.map((row) =>
        row.label === undefined ? (
          <span key={row.key} className="text-[0.9375rem] font-semibold text-text tabular-nums">
            {row.value}
          </span>
        ) : (
          <span key={row.key} className="flex items-center gap-3 text-[0.8125rem]">
            <span className="flex items-center gap-1.5 text-text-muted">
              {row.mark}
              {row.label}
            </span>
            <span className="ml-auto font-semibold text-text tabular-nums">{row.value}</span>
          </span>
        ),
      )}
    </span>
  )
}

/** DL-VIZ-05: the thin rule down the chart at the point being looked at. */
export function ChartRule({ left }: { left: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-text-faint"
      style={{ left: `${String(left)}%` }}
    />
  )
}

/** A series' key in a callout's row, drawn as in the chart's legend. */
export function TipMark({
  kind,
}: {
  kind: 'line' | 'solid' | 'dashed' | 'dashedMuted' | 'projection'
}) {
  const look = {
    line: 'h-[3px] rounded-full bg-brand',
    projection: 'border-t-[1.5px] border-dashed border-brand',
    solid: 'border-t-[1.5px] border-text-muted',
    dashed: 'border-t-[1.5px] border-dashed border-text-faint',
    dashedMuted: 'border-t-[1.5px] border-dashed border-text-muted',
  }[kind]
  return <span className={`w-3 shrink-0 ${look}`} />
}
