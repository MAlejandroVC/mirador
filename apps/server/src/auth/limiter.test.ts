import { describe, expect, it } from 'vitest'
import { Limiter } from './limiter.ts'

describe('Limiter', () => {
  it('SEC-03: blocks a key after its attempts, until the window ends', () => {
    let now = 0
    const limiter = new Limiter(2, 1000, () => now)

    limiter.hit('a')
    limiter.hit('a')
    expect(limiter.blocked('a')).toBe(true)
    expect(limiter.blocked('b')).toBe(false)

    now = 1001
    expect(limiter.blocked('a')).toBe(false)
  })

  it('SEC-03: keeps a bounded number of keys, forgetting the oldest first', () => {
    const limiter = new Limiter(1, 60_000, () => 0, 10)

    for (let key = 0; key <= 10; key += 1) limiter.hit(`${key}`)

    expect(limiter.blocked('0')).toBe(false)
    expect(limiter.blocked('10')).toBe(true)
  })

  it('SEC-03: stays fast with many addresses', () => {
    const limiter = new Limiter(1, 60_000, () => 0, 50_000)
    const start = performance.now()

    for (let index = 0; index < 200_000; index += 1) limiter.hit(`address ${index}`)

    expect(performance.now() - start).toBeLessThan(2000)
  })
})
