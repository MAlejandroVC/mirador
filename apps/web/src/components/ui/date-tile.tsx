import { tileStyle } from './tile-style'

// DL-CMP-16: a date to come as a 34 px tile, like Calendar's icon: the month short in
// `brand`, the day under it, on the app's own tint (DL-COL-13). The row's text says
// what happens that day, so screen readers skip the tile.
export function DateTile({ month, day }: { month: string; day: string }) {
  return (
    <span
      aria-hidden
      style={tileStyle()}
      className="flex size-[2.125rem] shrink-0 flex-col items-center justify-center rounded-[0.625rem] leading-none"
    >
      <span className="text-[0.5625rem] font-semibold tracking-[0.06em] uppercase">{month}</span>
      <span className="mt-0.5 text-[0.9375rem] font-semibold text-text tabular-nums">{day}</span>
    </span>
  )
}
