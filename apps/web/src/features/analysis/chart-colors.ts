import type { TileColor } from '../../components/ui/tile-style'

// DL-VIZ-02, DL-COL-06: the colors charts draw with.

/** A color for a chart mark: a category color, `brand`, or `other` for the rest. */
export type MarkColor = TileColor | 'brand' | 'other'

/** DL-COL-06: the softer tone of a color, for bars; `other` is `text-faint` (DL-VIZ-03). */
export function softColor(color: MarkColor, strength = 1): string {
  if (color === 'other') return 'var(--mirador-text-faint)'
  return `color-mix(in srgb, var(--mirador-${color}) calc(var(--mirador-bar-mix) * ${String(strength)}), var(--mirador-surface))`
}

export function fullColor(color: MarkColor): string {
  return color === 'other' ? 'var(--mirador-text-faint)' : `var(--mirador-${color})`
}

/**
 * The top `max` parts, the rest summed into one `other` part (DL-VIZ-03).
 */
export function topParts(
  parts: readonly { key: string; value: number; color: MarkColor }[],
  max = 6,
): { key: string; value: number; color: MarkColor }[] {
  if (parts.length <= max + 1) return [...parts]
  const rest = parts.slice(max).reduce((sum, part) => sum + part.value, 0)
  return [...parts.slice(0, max), { key: 'other', value: rest, color: 'other' }]
}
