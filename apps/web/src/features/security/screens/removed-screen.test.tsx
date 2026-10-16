import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../lib/i18n'
import {
  type FakeServer,
  fakeVault,
  renderApp,
  stubServer,
  unlockedVault,
} from '../../../test-utils'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function removed(): FakeServer {
  return {
    signedIn: 'ben',
    removedUntil: '2026-11-15T12:00:00.000Z',
    records: [
      {
        id: 'w1',
        revision: 1,
        body: { deleted: false, type: 'wallet', schema: 1, data: { name: 'Checking' } },
      },
    ],
  }
}

describe('removed account', () => {
  it('SYS-23: a removed account sees only the screen to download its data', async () => {
    const server = removed()
    stubServer(server)
    const { router } = renderApp('/transactions', unlockedVault(server))

    expect(
      await screen.findByRole('heading', { name: 'You were removed from this server' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/removed')
    expect(screen.getByText(/Download it before November 15, 2026/)).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Run your own Mirador' })).toHaveAttribute(
      'href',
      'https://github.com/MAlejandroVC/mirador',
    )
  })

  it('SYS-23: the data is decrypted and saved on the device, never sent anywhere', async () => {
    const user = userEvent.setup()
    const server = removed()
    stubServer(server)
    const saved: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      saved.push(blob as Blob)
      return 'blob:mirador'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const vault = unlockedVault(server)
    renderApp('/removed', vault)

    await user.click(await screen.findByRole('button', { name: 'Download my data' }))

    expect(await screen.findByText(/^Saved./)).toBeInTheDocument()
    expect(click).toHaveBeenCalledTimes(1)
    const file = JSON.parse(await saved[0]!.text()) as { records: unknown[] }
    expect(file.records).toEqual([
      { id: 'w1', type: 'wallet', schema: 1, data: { name: 'Checking' } },
    ])
    // Zero knowledge: nothing went to the server; only the session was asked for.
    const requests = vi.mocked(fetch).mock.calls.map(([input]) => input)
    expect(requests.every((path) => path === '/api/session')).toBe(true)
    expect(vault.saveRecords).not.toHaveBeenCalled()
  })

  it('SYS-23: a removed account unlocks first, then lands on its screen', async () => {
    const user = userEvent.setup()
    const server = removed()
    stubServer(server)
    renderApp('/', fakeVault(server))

    expect(await screen.findByRole('heading', { name: 'Unlock Mirador' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Password'), 'password')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    expect(
      await screen.findByRole('heading', { name: 'You were removed from this server' }),
    ).toBeInTheDocument()
  })

  it('SYS-23: an account that was not removed never sees that screen', async () => {
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const { router } = renderApp('/removed', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Home', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('SYS-23: in Spanish too', async () => {
    await i18n.changeLanguage('es')
    const server = removed()
    stubServer(server)
    renderApp('/removed', unlockedVault(server))

    expect(
      await screen.findByRole('heading', { name: 'Te eliminaron de este servidor' }),
    ).toBeInTheDocument()
  })
})
