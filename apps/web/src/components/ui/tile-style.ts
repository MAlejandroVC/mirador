import type { CSSProperties } from 'react'

/** The 12 category colors (DL-COL-11), the only colors a tile takes. */
export type TileColor =
  | 'clay'
  | 'bark'
  | 'marigold'
  | 'meadow'
  | 'moss'
  | 'lagoon'
  | 'lake'
  | 'dusk'
  | 'heather'
  | 'plum'
  | 'berry'
  | 'stone'

// DL-COL-08: the icon in full color on its color mixed into the surface.
export function tileStyle(color: TileColor): CSSProperties {
  const value = `var(--mirador-${color})`
  return {
    color: value,
    backgroundColor: `color-mix(in srgb, ${value} var(--mirador-tile-mix), var(--mirador-surface))`,
  }
}
