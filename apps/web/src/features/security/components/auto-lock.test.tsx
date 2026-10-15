import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../lib/i18n'
import { type FakeServer, renderApp, stubServer, unlockedVault } from '../../../test-utils'
import { saveAutoLock } from '../lib/auto-lock'

const minute = 60 * 1000

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
  setHidden(false)
})

async function home() {
  const server: FakeServer = { signedIn: 'ana' }
  stubServer(server)
  const vault = unlockedVault(server)
  const app = renderApp('/', vault)
  await screen.findByRole('heading', { name: 'Home', level: 1 })
  return { vault, ...app }
}

describe('auto-lock', () => {
  it('SEC-12: locks after five minutes without use and asks to unlock again', async () => {
    const { vault, router } = await home()

    await act(() => vi.advanceTimersByTimeAsync(4 * minute))
    expect(vault.lock).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(minute))

    expect(vault.lock).toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: 'Unlock Mirador' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/unlock')
  })

  it('SEC-12: a tap or a key press starts the wait again', async () => {
    const { vault } = await home()

    await act(() => vi.advanceTimersByTimeAsync(4 * minute))
    window.dispatchEvent(new Event('pointerdown'))
    await act(() => vi.advanceTimersByTimeAsync(4 * minute))
    window.dispatchEvent(new KeyboardEvent('keydown'))
    await act(() => vi.advanceTimersByTimeAsync(4 * minute))

    expect(vault.lock).not.toHaveBeenCalled()
  })

  it('SEC-12: time away from the app counts, checked as soon as it comes back', async () => {
    saveAutoLock(15)
    const { vault } = await home()

    setHidden(true)
    // Timers barely run in the background: only the clock moves.
    vi.setSystemTime(Date.now() + 20 * minute)
    await act(async () => {
      setHidden(false)
      await Promise.resolve()
    })

    expect(await screen.findByRole('heading', { name: 'Unlock Mirador' })).toBeInTheDocument()
    expect(vault.lock).toHaveBeenCalled()
  })

  it('SEC-12: "as soon as I leave the app" locks when it goes out of sight', async () => {
    saveAutoLock('leave')
    const { vault } = await home()

    await act(() => vi.advanceTimersByTimeAsync(60 * minute))
    expect(vault.lock).not.toHaveBeenCalled()
    await act(async () => {
      setHidden(true)
      await Promise.resolve()
    })

    expect(await screen.findByRole('heading', { name: 'Unlock Mirador' })).toBeInTheDocument()
  })
})
