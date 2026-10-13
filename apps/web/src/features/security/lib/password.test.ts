import { describe, expect, it } from 'vitest'
import { passwordChecks, passwordFollowsRules } from './password'

describe('password rules', () => {
  it('SYS-06: needs 8 characters with a lowercase and an uppercase letter, a number and a symbol', () => {
    expect(passwordFollowsRules('Monte-24')).toBe(true)
    expect(passwordFollowsRules('Monte-2')).toBe(false)
    expect(passwordFollowsRules('monte-24')).toBe(false)
    expect(passwordFollowsRules('MONTE-24')).toBe(false)
    expect(passwordFollowsRules('Monte-ab')).toBe(false)
    expect(passwordFollowsRules('Monte024')).toBe(false)
  })

  it('SYS-06: counts letters and numbers in any language, and a space as a symbol', () => {
    expect(passwordFollowsRules('Año 2026 bueno')).toBe(true)
    expect(passwordFollowsRules('ÑANDÚ¿24ñ')).toBe(true)
    // Eight characters, even when some take two code units.
    expect(passwordFollowsRules('Aa1!😀😀😀😀')).toBe(true)
  })

  it('SYS-06: says which rules a password already meets, to tick them off while typing', () => {
    expect(passwordChecks('')).toEqual({
      length: false,
      uppercase: false,
      lowercase: false,
      number: false,
      symbol: false,
    })
    expect(passwordChecks('monte 2')).toEqual({
      length: false,
      uppercase: false,
      lowercase: true,
      number: true,
      symbol: true,
    })
    expect(Object.values(passwordChecks('Monte-24')).every(Boolean)).toBe(true)
  })
})
