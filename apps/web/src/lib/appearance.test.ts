import { describe, expect, it } from 'vitest'
import {
  applyAppearance,
  defaultMode,
  defaultPalette,
  isMode,
  isPalette,
  palettes,
} from './appearance'

describe('appearance', () => {
  it('SYS-17: offers the eight curated palettes with Sage Grove as the default', () => {
    expect(palettes).toEqual([
      'paper',
      'sage-grove',
      'cami',
      'coronado',
      'glacier',
      'mesa',
      'jacaranda',
      'sierra',
    ])
    expect(defaultPalette).toBe('sage-grove')
  })

  it('SYS-16: Automatic is the default mode', () => {
    expect(defaultMode).toBe('automatic')
  })

  it('SYS-17: sets the chosen palette on the document', () => {
    const root = document.createElement('html')
    applyAppearance({ mode: 'automatic', palette: 'cami' }, root)
    expect(root.getAttribute('data-palette')).toBe('cami')
  })

  it('SYS-16: Light and Dark set the theme, Automatic leaves it to the device', () => {
    const root = document.createElement('html')
    applyAppearance({ mode: 'dark', palette: 'sierra' }, root)
    expect(root.getAttribute('data-theme')).toBe('dark')
    applyAppearance({ mode: 'light', palette: 'sierra' }, root)
    expect(root.getAttribute('data-theme')).toBe('light')
    applyAppearance({ mode: 'automatic', palette: 'sierra' }, root)
    expect(root.hasAttribute('data-theme')).toBe(false)
  })

  it('SYS-17: rejects a palette or mode that is not offered', () => {
    expect(isPalette('glacier')).toBe(true)
    expect(isPalette('midnight')).toBe(false)
    expect(isMode('dark')).toBe(true)
    expect(isMode('sepia')).toBe(false)
  })
})
