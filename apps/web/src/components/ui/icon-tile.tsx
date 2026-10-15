import type { Icon } from './icons'
import { type TileColor, tileStyle } from './tile-style'

// DL-CMP-02, DL-ICO-04: a 34 px tile with a 20 px Duotone icon, beside a text label,
// so screen readers skip it (DL-A11Y-04).
export function IconTile({ icon: IconComponent, color }: { icon: Icon; color: TileColor }) {
  return (
    <span
      aria-hidden
      style={tileStyle(color)}
      className="grid size-[2.125rem] shrink-0 place-items-center rounded-[0.625rem]"
    >
      <IconComponent weight="duotone" className="size-5" />
    </span>
  )
}
