import { describe, expect, it } from 'vitest'
import { Challenges } from './challenges.ts'

describe('passkey challenges', () => {
  it('SYS-06: a challenge works once, for its own ceremony, until it expires', () => {
    let now = 0
    const challenges = new Challenges(1000, () => now)
    const signIn = { kind: 'sign-in' as const, challenge: 'abc', userId: null }

    const once = challenges.add(signIn)
    expect(challenges.take(once, 'sign-in')).toEqual(signIn)
    expect(challenges.take(once, 'sign-in')).toBeNull()

    const other = challenges.add(signIn)
    expect(challenges.take(other, 'registration')).toBeNull()
    expect(challenges.take(other, 'sign-in')).toBeNull()

    const late = challenges.add(signIn)
    now = 1000
    expect(challenges.take(late, 'sign-in')).toBeNull()
  })

  it('SYS-06: forgets the oldest challenges past the cap', () => {
    const challenges = new Challenges(1000, () => 0, 2)
    const first = challenges.add({ kind: 'sign-in', challenge: 'a', userId: null })
    const second = challenges.add({ kind: 'sign-in', challenge: 'b', userId: null })
    const third = challenges.add({ kind: 'sign-in', challenge: 'c', userId: null })

    expect(challenges.take(first, 'sign-in')).toBeNull()
    expect(challenges.take(second, 'sign-in')?.challenge).toBe('b')
    expect(challenges.take(third, 'sign-in')?.challenge).toBe('c')
  })
})
