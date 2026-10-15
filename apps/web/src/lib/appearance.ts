// SYS-16, SYS-17, DL-COL-01: the appearance mode and the palette are two attributes on
// <html>; index.css holds every palette's tokens, so switching is one attribute change
// and no component needs to know which palette is on.

/** The curated palettes, in the order the picker shows them (SYS-17). */
export const palettes = [
  'paper',
  'sage-grove',
  'cami',
  'coronado',
  'glacier',
  'mesa',
  'jacaranda',
  'sierra',
] as const

export type Palette = (typeof palettes)[number]

export const defaultPalette: Palette = 'sage-grove'

/** SYS-16: Automatic follows the device. */
export const modes = ['automatic', 'light', 'dark'] as const

export type Mode = (typeof modes)[number]

export const defaultMode: Mode = 'automatic'

export interface Appearance {
  mode: Mode
  palette: Palette
}

export function isPalette(value: unknown): value is Palette {
  return palettes.includes(value as Palette)
}

export function isMode(value: unknown): value is Mode {
  return modes.includes(value as Mode)
}

/** Applies a mode and palette to the document; Automatic leaves the choice to the device. */
export function applyAppearance(
  { mode, palette }: Appearance,
  root: HTMLElement = document.documentElement,
) {
  if (mode === 'automatic') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)
  root.setAttribute('data-palette', palette)
}
