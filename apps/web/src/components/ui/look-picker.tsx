import type { Icon } from './icons'
import { type TileColor, tileStyle } from './tile-style'

const colors: readonly TileColor[] = [
  'clay',
  'bark',
  'marigold',
  'meadow',
  'moss',
  'lagoon',
  'lake',
  'dusk',
  'heather',
  'plum',
  'berry',
  'stone',
]

// WAL-23, CAT-14, CAT-25: the 12 curated colors, in the picker's order (DL-COL-11).
// Curated only: there is no custom color (DL-PRI-04).
export function ColorChoices({
  label,
  value,
  colorLabel,
  onChange,
}: {
  label: string
  value: TileColor
  colorLabel: (color: TileColor) => string
  onChange: (color: TileColor) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-6">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={colorLabel(color)}
          onClick={() => {
            onChange(color)
          }}
          className="grid min-h-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-brand"
        >
          <span
            className={`size-8 rounded-full ${value === color ? 'ring-2 ring-text ring-offset-2 ring-offset-inset' : ''}`}
            style={{ backgroundColor: `var(--mirador-${color})` }}
          />
        </button>
      ))}
    </div>
  )
}

// WAL-23, CAT-14: the curated icons in a grid; the chosen one shows as its tile.
export function IconChoices<Name extends string>({
  label,
  icons,
  components,
  value,
  color,
  iconLabel,
  onChange,
}: {
  label: string
  icons: readonly Name[]
  components: Record<Name, Icon>
  value: Name
  color: TileColor
  iconLabel: (icon: Name) => string
  onChange: (icon: Name) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-6 gap-y-1">
      {icons.map((icon) => {
        const Glyph: Icon = components[icon]
        const checked = value === icon
        return (
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={iconLabel(icon)}
            onClick={() => {
              onChange(icon)
            }}
            className="grid min-h-11 place-items-center rounded-xl focus-visible:outline-2 focus-visible:outline-brand"
          >
            <span
              style={checked ? tileStyle(color) : undefined}
              className={`grid size-10 place-items-center rounded-[0.625rem] ${checked ? '' : 'text-text-muted'}`}
            >
              <Glyph weight={checked ? 'duotone' : 'regular'} className="size-6" />
            </span>
          </button>
        )
      })}
    </div>
  )
}
