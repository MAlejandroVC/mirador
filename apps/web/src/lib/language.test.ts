import { afterEach, describe, expect, it, vi } from 'vitest'
import { deviceLanguage, readLanguageChoice, resolveLanguage, saveLanguageChoice } from './language'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

function stubDevice(languages: string[]) {
  vi.stubGlobal('navigator', { languages, language: languages[0] ?? '' })
}

describe('language', () => {
  it('SYS-19: is Automatic until a language is chosen, and keeps the choice', () => {
    expect(readLanguageChoice()).toBe('automatic')
    saveLanguageChoice('es')
    expect(readLanguageChoice()).toBe('es')
  })

  it('SYS-19: ignores a stored value it does not know', () => {
    localStorage.setItem('mirador.language', 'fr')
    expect(readLanguageChoice()).toBe('automatic')
  })

  it('SYS-10: Automatic picks the first device language Mirador has, English otherwise', () => {
    stubDevice(['fr-FR', 'es-MX', 'en-US'])
    expect(deviceLanguage()).toBe('es')
    expect(resolveLanguage('automatic')).toBe('es')
    expect(resolveLanguage('en')).toBe('en')
    stubDevice(['de-DE'])
    expect(deviceLanguage()).toBe('en')
  })
})
