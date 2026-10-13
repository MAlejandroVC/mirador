import { describe, expect, it } from 'vitest'
import { usernameChecks, usernameFollowsRules } from './username'

describe('username rules', () => {
  it('SYS-06: ticks off the length and the characters separately, like the server checks them', () => {
    expect(usernameChecks('')).toEqual({ length: false, characters: false })
    expect(usernameChecks('an')).toEqual({ length: false, characters: true })
    expect(usernameChecks('ana maría')).toEqual({ length: true, characters: false })
    expect(usernameChecks(' Ana.Maria_2 ')).toEqual({ length: true, characters: true })
    expect(usernameChecks('a'.repeat(33))).toEqual({ length: false, characters: true })
    for (const name of ['', 'an', 'ana maría', ' Ana.Maria_2 ', 'a'.repeat(33), 'a'.repeat(32)]) {
      const met = usernameChecks(name)
      expect(met.length && met.characters).toBe(usernameFollowsRules(name))
    }
  })
})
