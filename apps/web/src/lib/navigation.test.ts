import { describe, expect, it } from 'vitest'
import { navDirection } from './navigation'

describe('navDirection', () => {
  it('DL-MOT-06: opening a screen slides forward, going back slides back', () => {
    expect(navDirection('/wallets', '/wallets/abc')).toBe('forward')
    expect(navDirection('/wallets/abc', '/wallets/abc/transactions')).toBe('forward')
    expect(navDirection('/wallets/abc/transactions', '/wallets/abc')).toBe('back')
    expect(navDirection('/wallets/abc', '/wallets')).toBe('back')
    expect(navDirection('/budget', '/settings')).toBe('forward')
    expect(navDirection('/settings/currency', '/settings')).toBe('back')
    expect(navDirection('/settings', '/wallets')).toBe('back')
  })

  it('DL-MOT-06: switching tabs or staying put does not move', () => {
    expect(navDirection('/wallets', '/budget')).toBe('none')
    expect(navDirection('/wallets/abc', '/')).toBe('none')
    expect(navDirection('/wallets', '/wallets')).toBe('none')
    expect(navDirection(undefined, '/wallets')).toBe('none')
  })
})
