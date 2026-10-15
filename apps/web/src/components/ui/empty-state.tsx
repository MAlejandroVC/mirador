import type { Icon } from './icons'
import type { ReactNode } from 'react'
import { type TileColor, tileStyle } from './tile-style'

// DL-CMP-14: a large icon tile, a short title, one sentence on what will appear here,
// and, once there is one, the filled button that fills it.
export function EmptyState({
  icon: IconComponent,
  color,
  title,
  children,
  action,
}: {
  icon: Icon
  color?: TileColor
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-6 py-8 text-center">
      {/* DL-ICO-02, DL-ICO-03: Duotone inside a tinted tile, hidden from screen readers
          because the title says it (DL-A11Y-04). */}
      <span
        aria-hidden
        style={tileStyle(color)}
        className="grid size-16 place-items-center rounded-[1.125rem]"
      >
        <IconComponent weight="duotone" className="size-9" />
      </span>
      <h2 className="text-[1.0625rem] font-semibold text-text">{title}</h2>
      <p className="max-w-80 text-[0.9375rem] text-text-muted">{children}</p>
      {action}
    </section>
  )
}
