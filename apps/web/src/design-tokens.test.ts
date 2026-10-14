import { describe, expect, it } from 'vitest'
import doc from '../../../docs/design-language.md?raw'
import css from './index.css?raw'

// DL-COL-07, DL-COL-11: the tokens in index.css must match the tables in the design
// language, so a color can't change in one place and not the other.

type Values = Record<string, string>

// "#23281C at 12%" in the doc is written rgb(35 40 28 / 12%) in CSS; compare one form.
function normalize(value: string) {
  const rgb = /^rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)$/.exec(value.trim())
  if (rgb) {
    const hex = rgb
      .slice(1, 4)
      .map((part) => Number(part).toString(16).padStart(2, '0'))
      .join('')
    return `#${hex} at ${rgb[4]}%`
  }
  return value.trim().toLowerCase()
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

// Rows under a "### heading": the first cell names the token, the last two are light and dark.
function documented(heading: string, name: (cell: string) => string) {
  const section = doc.split(`### ${heading}`)[1]?.split(/^##/m)[0] ?? ''
  const light: Values = {}
  const dark: Values = {}
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    const [, first = '', ...rest] = cells
    const values = rest.filter(Boolean)
    if (!/#[0-9A-F]{6}/i.test(values.at(-1) ?? '')) continue
    light[name(first)] = normalize(values.at(-2) ?? '')
    dark[name(first)] = normalize(values.at(-1) ?? '')
  }
  return { light, dark }
}

const appTokens = documented('App tokens', (cell) => cell.replaceAll('`', ''))
const categoryColors = documented('Category colors', (cell) => cell.toLowerCase())
const light = block(':root')
const dark = block(":root[data-theme='dark']")
const deviceDark = block(":root:not([data-theme='light'])")

describe('design tokens', () => {
  it('DL-COL-07: the app tokens match the design language in light and dark', () => {
    expect(Object.keys(appTokens.light)).toHaveLength(16)
    for (const [token, value] of Object.entries(appTokens.light)) {
      expect(light[token], token).toBe(value)
    }
    for (const [token, value] of Object.entries(appTokens.dark)) {
      expect(dark[token], token).toBe(value)
    }
  })

  it('DL-COL-11: the 12 category colors match the design language in light and dark', () => {
    expect(Object.keys(categoryColors.light)).toHaveLength(12)
    for (const [color, value] of Object.entries(categoryColors.light)) {
      expect(light[color], color).toBe(value)
    }
    for (const [color, value] of Object.entries(categoryColors.dark)) {
      expect(dark[color], color).toBe(value)
    }
  })

  it('DL-COL-07: the device dark mode and the chosen dark theme use the same values', () => {
    expect(deviceDark).toEqual(dark)
  })
})
