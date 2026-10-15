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

// SYS-16, SYS-17: a choice per device, like iOS, so it lives in this browser's storage
// and applies before unlocking: the sign-in screen already wears it. It is a setting,
// not user data, and nothing secret (like the auto-lock choice).
const storageKey = 'mirador.appearance'

export const defaultAppearance: Appearance = { mode: defaultMode, palette: defaultPalette }

export function readAppearance(): Appearance {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (typeof stored === 'object' && stored !== null) {
      const { mode, palette } = stored as Record<string, unknown>
      return {
        mode: isMode(mode) ? mode : defaultMode,
        palette: isPalette(palette) ? palette : defaultPalette,
      }
    }
  } catch {
    // Storage blocked or garbled: the defaults still look right.
  }
  return defaultAppearance
}

/** Applies the choice at once and keeps it for next time on this device. */
export function saveAppearance(appearance: Appearance) {
  applyAppearance(appearance)
  try {
    localStorage.setItem(storageKey, JSON.stringify(appearance))
  } catch {
    // Still applied for this visit.
  }
}

/** The palette names as people read them (SYS-17); the same in every language. */
export const paletteNames: Record<Palette, string> = {
  paper: 'Paper',
  'sage-grove': 'Sage Grove',
  cami: 'Cami',
  coronado: 'Coronado',
  glacier: 'Glacier',
  mesa: 'Mesa',
  jacaranda: 'Jacaranda',
  sierra: 'Sierra',
}

export interface Swatch {
  background: string
  surface: string
  separator: string
  brand: string
  hero: string
  glow: string
}

// The colors the palette picker draws each choice with. index.css sets a palette only on
// <html>, so the picker can't borrow it for a preview; design-tokens.test.ts checks
// these against index.css.
export const swatches: Record<Palette, Record<'light' | 'dark', Swatch>> = {
  paper: {
    light: {
      background: '#f2f2f7',
      surface: '#ffffff',
      separator: 'rgb(60 60 67 / 12%)',
      brand: '#1c1c1e',
      hero: '#1c1c1e',
      glow: 'transparent',
    },
    dark: {
      background: '#000000',
      surface: '#1c1c1e',
      separator: 'rgb(235 235 245 / 13%)',
      brand: '#f2f2f7',
      hero: '#2c2c2e',
      glow: 'transparent',
    },
  },
  'sage-grove': {
    light: {
      background: '#f3f2ef',
      surface: '#ffffff',
      separator: 'rgb(35 40 28 / 12%)',
      brand: '#3d6b45',
      hero: '#3d6b45',
      glow: '#ffce6e',
    },
    dark: {
      background: '#0a0a09',
      surface: '#191917',
      separator: 'rgb(225 235 215 / 13%)',
      brand: '#4e9e5c',
      hero: '#1e4527',
      glow: '#ffce6e',
    },
  },
  cami: {
    light: {
      background: '#faf4f6',
      surface: '#ffffff',
      separator: 'rgb(58 36 48 / 12%)',
      brand: '#d46a98',
      hero: '#f6d2e0',
      glow: '#b9a4f2',
    },
    dark: {
      background: '#0c0a0b',
      surface: '#1d181b',
      separator: 'rgb(245 225 234 / 13%)',
      brand: '#f0a0c4',
      hero: '#4e2a3e',
      glow: '#b9a2f0',
    },
  },
  coronado: {
    light: {
      background: '#f4f1ea',
      surface: '#ffffff',
      separator: 'rgb(31 46 48 / 12%)',
      brand: '#0b6e7a',
      hero: '#0b6e7a',
      glow: '#ffd27a',
    },
    dark: {
      background: '#070a0b',
      surface: '#151b1c',
      separator: 'rgb(221 237 237 / 13%)',
      brand: '#3fb7c2',
      hero: '#0c4a52',
      glow: '#ffd27a',
    },
  },
  glacier: {
    light: {
      background: '#eef2f6',
      surface: '#ffffff',
      separator: 'rgb(31 43 56 / 12%)',
      brand: '#2f5f8a',
      hero: '#24496e',
      glow: '#6fe3c1',
    },
    dark: {
      background: '#07090c',
      surface: '#151a21',
      separator: 'rgb(221 231 242 / 13%)',
      brand: '#7fb2e5',
      hero: '#1a3452',
      glow: '#5fd6b4',
    },
  },
  mesa: {
    light: {
      background: '#f6f0e7',
      surface: '#ffffff',
      separator: 'rgb(58 42 29 / 12%)',
      brand: '#a5502f',
      hero: '#a5502f',
      glow: '#f4b860',
    },
    dark: {
      background: '#0b0908',
      surface: '#1c1816',
      separator: 'rgb(242 228 214 / 13%)',
      brand: '#e08a63',
      hero: '#5a2a1a',
      glow: '#f4b860',
    },
  },
  jacaranda: {
    light: {
      background: '#f5f3f8',
      surface: '#ffffff',
      separator: 'rgb(42 34 56 / 12%)',
      brand: '#6a4fb0',
      hero: '#6a4fb0',
      glow: '#f2b8d8',
    },
    dark: {
      background: '#09080c',
      surface: '#18161d',
      separator: 'rgb(230 224 242 / 13%)',
      brand: '#a58deb',
      hero: '#35265e',
      glow: '#e9a6cf',
    },
  },
  sierra: {
    light: {
      background: '#f1f0ee',
      surface: '#ffffff',
      separator: 'rgb(42 46 51 / 12%)',
      brand: '#505b66',
      hero: '#5a626b',
      glow: '#e4ecf4',
    },
    dark: {
      background: '#09090a',
      surface: '#18191b',
      separator: 'rgb(226 229 234 / 13%)',
      brand: '#aeb8c2',
      hero: '#363c43',
      glow: '#c9d6e3',
    },
  },
}
