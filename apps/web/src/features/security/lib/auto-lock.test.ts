import { afterEach, describe, expect, it } from 'vitest'
import { defaultAutoLock, readAutoLock, saveAutoLock, shouldLock } from './auto-lock'

const minute = 60 * 1000

afterEach(() => {
  localStorage.clear()
})

describe('auto-lock', () => {
  it('SEC-12: locks once the chosen time passes without use', () => {
    expect(shouldLock(5, 0, 5 * minute - 1, false)).toBe(false)
    expect(shouldLock(5, 0, 5 * minute, false)).toBe(true)
    // Out of sight counts as unused time too, not as a reason on its own.
    expect(shouldLock(15, 0, 10 * minute, true)).toBe(false)
  })

  it('SEC-12: "as soon as I leave" locks whenever the app is out of sight', () => {
    expect(shouldLock('leave', 0, 0, true)).toBe(true)
    expect(shouldLock('leave', 0, 600 * minute, false)).toBe(false)
  })

  it('SEC-12: remembers the choice on this device, five minutes until one is made', () => {
    expect(readAutoLock()).toBe(defaultAutoLock)
    expect(defaultAutoLock).toBe(5)

    saveAutoLock('leave')
    expect(readAutoLock()).toBe('leave')
    saveAutoLock(60)
    expect(readAutoLock()).toBe(60)

    localStorage.setItem('mirador.autoLock', 'never')
    expect(readAutoLock()).toBe(5)
  })
})
