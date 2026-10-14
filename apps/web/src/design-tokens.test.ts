import { describe, expect, it } from 'vitest'
import doc from '../../../docs/design-language.md?raw'
import reference from '../../../docs/design-language-palettes.html?raw'
import css from './index.css?raw'
import { defaultPalette, palettes } from './lib/appearance'

// DL-COL-11, DL-COL-12: the tokens in index.css must match the tables in the design
// language, so a color can't change in one place and not the other, and every palette
// must keep the contrast the design language promises.

type Values = Record<string, string>
type Mode = 'light' | 'dark'

// "#23281C at 12%" in the doc is written rgb(35 40 28 / 12%) in CSS, and a palette
// without a glow is "none" in the doc and transparent in CSS; compare one form.
function normalize(value: string) {
  const rgb = /^rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)$/.exec(value.trim())
  if (rgb) {
    const hex = rgb
      .slice(1, 4)
      .map((part) => Number(part).toString(16).padStart(2, '0'))
      .join('')
    return `#${hex} at ${rgb[4]}%`
  }
  const plain = value.trim().toLowerCase()
  return plain === 'transparent' ? 'none' : plain
}

function block(selector: string) {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`Missing ${selector} in index.css`)
  const body = css.slice(start, css.indexOf('}', start))
  const values: Values = {}
  for (const match of body.matchAll(/--mirador-([a-z-]+): ([^;]+);/g)) {
    values[match[1] ?? ''] = normalize(match[2] ?? '')
  }
  return values
}

// Rows of a markdown table: the first cell names the token, the last two are light and dark.
function table(section: string, name: (cell: string) => string) {
  const light: Values = {}
  const dark: Values = {}
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    const [, first = '', ...rest] = cells
    const values = rest.filter(Boolean)
    if (!/^(#[0-9A-F]{6}|none)/i.test(values.at(-1) ?? '')) continue
    light[name(first)] = normalize(values.at(-2) ?? '')
    dark[name(first)] = normalize(values.at(-1) ?? '')
  }
  return { light, dark }
}

function section(heading: string) {
  return doc.split(`### ${heading}\n`)[1]?.split(/^###? /m)[0] ?? ''
}

const token = (cell: string) => cell.replaceAll('`', '')
const shared = table(section('Shared tokens'), token)
const categoryColors = table(section('Category colors'), (cell) => cell.toLowerCase())

// Each palette is a "#### Name" with its id in the first line and its own table.
const documentedPalettes = section('Palettes')
  .split(/^#### /m)
  .slice(1)
  .map((part) => ({
    name: part.split('\n')[0]?.replace(' (default)', '') ?? '',
    id: /Id `([a-z-]+)`/.exec(part)?.[1] ?? '',
    ...table(part, token),
  }))

const defaults = {
  light: block(':root'),
  dark: block(":root[data-theme='dark']"),
  deviceDark: block(":root:not([data-theme='light'])"),
}

function cssPalette(id: string) {
  if (id === defaultPalette) return defaults
  const selector = `:root[data-palette='${id}']`
  return {
    light: block(selector),
    dark: block(`${selector}[data-theme='dark']`),
    deviceDark: block(`${selector}:not([data-theme='light'])`),
  }
}

// WCAG 2.2 relative luminance and contrast ratio.
function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)
}

const PALETTE_TOKENS = [
  'background',
  'surface',
  'inset',
  'text',
  'text-muted',
  'text-faint',
  'separator',
  'fill',
  'brand',
  'on-brand',
  'hero',
  'on-hero',
  'glow',
]

describe('design tokens', () => {
  it('DL-COL-12: the design language documents the eight palettes, in picker order', () => {
    expect(documentedPalettes.map((palette) => palette.id)).toEqual([...palettes])
  })

  it.each(documentedPalettes)(
    'DL-COL-12: $name sets every palette token, matching the design language in light and dark',
    ({ id, light, dark }) => {
      expect(Object.keys(light)).toEqual(PALETTE_TOKENS)
      const tokens = cssPalette(id)
      for (const mode of ['light', 'dark'] as const) {
        const documented = mode === 'light' ? light : dark
        for (const [name, value] of Object.entries(documented)) {
          expect(tokens[mode][name], `${mode} ${name}`).toBe(value)
        }
      }
    },
  )

  it.each(documentedPalettes)(
    'DL-COL-12: $name uses the same values for the device dark mode and the chosen dark mode',
    ({ id }) => {
      const tokens = cssPalette(id)
      expect(tokens.deviceDark).toEqual(tokens.dark)
    },
  )

  it('DL-COL-12: the shared tokens match the design language and no palette overrides them', () => {
    expect(Object.keys(shared.light)).toEqual(['warning', 'danger', 'sun', 'on-sun'])
    for (const [name, value] of Object.entries(shared.light)) {
      expect(defaults.light[name], name).toBe(value)
    }
    for (const [name, value] of Object.entries(shared.dark)) {
      expect(defaults.dark[name], name).toBe(value)
    }
    for (const { id } of documentedPalettes.filter((palette) => palette.id !== defaultPalette)) {
      const tokens = cssPalette(id)
      expect(Object.keys(tokens.light), id).toEqual(PALETTE_TOKENS)
      expect(Object.keys(tokens.dark), id).toEqual(PALETTE_TOKENS)
    }
  })

  it('DL-COL-12: the palettes reference page draws with the design language values', () => {
    const data = /<script type="application\/json" id="palette-data">([\s\S]*?)<\/script>/.exec(
      reference,
    )?.[1]
    const page = JSON.parse(data ?? '{}') as {
      palettes: { id: string; light: Values; dark: Values }[]
      shared: Record<Mode, Values>
      categories: Record<Mode, Values>
    }
    expect(page.palettes.map((palette) => palette.id)).toEqual([...palettes])
    for (const palette of page.palettes) {
      const documented = documentedPalettes.find((entry) => entry.id === palette.id)
      for (const mode of ['light', 'dark'] as const) {
        const values = Object.fromEntries(
          Object.entries(palette[mode]).map(([name, value]) => [name, normalize(value)]),
        )
        expect(values, `${palette.id} ${mode}`).toEqual(documented?.[mode])
      }
    }
    for (const mode of ['light', 'dark'] as const) {
      expect(
        Object.fromEntries(
          Object.entries(page.shared[mode]).map(([name, value]) => [name, normalize(value)]),
        ),
      ).toEqual(shared[mode])
      expect(
        Object.fromEntries(
          Object.entries(page.categories[mode]).map(([name, value]) => [
            name.toLowerCase(),
            normalize(value),
          ]),
        ),
      ).toEqual(categoryColors[mode])
    }
  })

  it('DL-COL-11: the 12 category colors match the design language in light and dark', () => {
    expect(Object.keys(categoryColors.light)).toHaveLength(12)
    for (const [color, value] of Object.entries(categoryColors.light)) {
      expect(defaults.light[color], color).toBe(value)
    }
    for (const [color, value] of Object.entries(categoryColors.dark)) {
      expect(defaults.dark[color], color).toBe(value)
      expect(defaults.deviceDark[color], color).toBe(value)
    }
  })

  const cases = documentedPalettes.flatMap((palette) =>
    (['light', 'dark'] as Mode[]).map((mode) => ({ name: palette.name, mode, t: palette[mode] })),
  )

  it.each(cases)(
    'DL-COL-12: $name in $mode meets the contrast the design language promises',
    ({ mode, t }) => {
      const value = (name: string) => t[name] ?? shared[mode][name] ?? ''
      const check = (fore: string, back: string, minimum: number) => {
        expect(contrast(value(fore), value(back)), `${fore} on ${back}`).toBeGreaterThanOrEqual(
          minimum,
        )
      }
      for (const back of ['background', 'surface']) {
        check('text', back, 4.5)
        check('text-muted', back, 4.5)
        check('warning', back, 4.5)
        check('sun', back, 3)
        for (const [color, hex] of Object.entries(categoryColors[mode])) {
          expect(contrast(hex, value(back)), `${color} on ${back}`).toBeGreaterThanOrEqual(3)
        }
      }
      check('brand', 'surface', 3)
      check('on-brand', 'brand', 4.5)
      check('on-hero', 'hero', 4.5)
    },
  )
})
