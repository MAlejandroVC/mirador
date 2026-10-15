import type { Icon } from './icons'
import { type TileColor, tileStyle } from './tile-style'

// DL-CMP-02, DL-ICO-04: a 34 px tile, in a category color or the app's `brand`, with a 20 px Duotone icon, beside a text label,
// so screen readers skip it (DL-A11Y-04). The large one, 56 px with a 32 px icon, heads a
// screen's header card (DL-CMP-06).
export function IconTile({
  icon: IconComponent,
  color,
  size = 'regular',
}: {
  icon: Icon
  color?: TileColor
  size?: 'regular' | 'large'
}) {
  return (
    <span
      aria-hidden
      style={tileStyle(color)}
      className={`grid shrink-0 place-items-center ${
        size === 'large' ? 'size-14 rounded-[0.875rem]' : 'size-[2.125rem] rounded-[0.625rem]'
      }`}
    >
      <IconComponent weight="duotone" className={size === 'large' ? 'size-8' : 'size-5'} />
    </span>
  )
}
