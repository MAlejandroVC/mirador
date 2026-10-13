import { describe, expect, it } from 'vitest'
import { newCode, normalizeCode } from './settings.ts'

describe('codes', () => {
  it('SYS-13: setup and invite codes have no letter that reads two ways', () => {
    const codes = Array.from({ length: 200 }, () => newCode())

    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/)
      expect(code).not.toMatch(/[ILOU]/)
      expect(normalizeCode(code)).toBe(code.replaceAll('-', ''))
    }
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('SYS-13: a code typed by hand still matches', () => {
    expect(normalizeCode('ab1o-l2cd 3efg')).toBe(normalizeCode('AB10-12CD-3EFG'))
  })
})
