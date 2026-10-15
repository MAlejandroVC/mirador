import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../lib/i18n'
import {
  fakeVault,
  type FakeServer,
  renderApp,
  stubServer,
  unlockedVault,
} from '../../../test-utils'
import { VaultError } from '../../../worker/errors'

// The device's passkey prompt can't run here, so the page's WebAuthn half is a stand-in;
// the worker's half is tested with real cryptography in worker/vault.test.ts.
const device = vi.hoisted(() => ({
  supported: true,
  prfOutput: () => new Uint8Array(32).fill(7),
}))
vi.mock('../lib/passkey', () => ({
  passkeysSupported: () => device.supported,
  createPasskey: vi.fn(() =>
    Promise.resolve({ response: { id: 'made' }, prfOutput: device.prfOutput() }),
  ),
  getPasskey: vi.fn(() =>
    Promise.resolve({ response: { id: 'used' }, prfOutput: device.prfOutput() }),
  ),
}))

const password = 'a sunny day in Monterrey'

beforeEach(async () => {
  device.supported = true
  await i18n.changeLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function section(name: string) {
  return within(screen.getByRole('region', { name }))
}

describe('passkeys and Face ID', () => {
  it('SYS-06: adds a passkey with the current password and lists it', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const vault = unlockedVault(server)
    renderApp('/security', vault)

    await screen.findByRole('heading', { name: 'Password and security' })
    const passkeys = section('Passkeys and Face ID')
    expect(await passkeys.findByText('No passkeys yet.')).toBeInTheDocument()
    await user.click(passkeys.getByRole('button', { name: 'Add a passkey' }))
    expect(passkeys.getByText('Enter your current password.')).toBeInTheDocument()
    expect(vault.startAddingPasskey).not.toHaveBeenCalled()

    await user.type(passkeys.getByLabelText('Current password'), password)
    await user.click(passkeys.getByRole('button', { name: 'Add a passkey' }))

    expect(vault.startAddingPasskey).toHaveBeenCalledWith(password)
    expect(vault.addPasskey).toHaveBeenCalledWith(
      expect.objectContaining({ challengeId: 'registration', response: { id: 'made' } }),
    )
    expect(
      await passkeys.findByText('Passkey added. Next time, unlock with it.'),
    ).toBeInTheDocument()
    expect(await passkeys.findByText('Passkey 1')).toBeInTheDocument()
    expect(passkeys.getByLabelText('Current password')).toHaveValue('')
  })

  it('SYS-06: says when the passkey has no way to unlock encrypted data', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const vault = fakeVault(server, {
      addPasskey: vi.fn(() => Promise.reject(new VaultError('passkey-unsupported'))),
    })
    await vault.unlock('')
    renderApp('/security', vault)

    await screen.findByRole('heading', { name: 'Password and security' })
    const passkeys = section('Passkeys and Face ID')
    await user.type(passkeys.getByLabelText('Current password'), password)
    await user.click(passkeys.getByRole('button', { name: 'Add a passkey' }))

    expect(await passkeys.findByRole('alert')).toHaveTextContent(
      "This passkey can't unlock encrypted data",
    )
  })

  it('SYS-06: removes a passkey', async () => {
    const user = userEvent.setup()
    const server: FakeServer = {
      signedIn: 'ana',
      passkeys: [
        {
          id: 'phone',
          createdAt: '2026-10-13T12:00:00.000Z',
          lastUsedAt: '2026-10-14T12:00:00.000Z',
        },
      ],
    }
    stubServer(server)
    renderApp('/security', unlockedVault(server))

    await screen.findByRole('heading', { name: 'Password and security' })
    const passkeys = section('Passkeys and Face ID')
    expect(
      await passkeys.findByText(/Added on Oct 13, 2026, last used on Oct 14, 2026/),
    ).toBeInTheDocument()
    await user.click(passkeys.getByRole('button', { name: 'Remove passkey 1' }))

    expect(await passkeys.findByText('No passkeys yet.')).toBeInTheDocument()
    expect(server.passkeys).toEqual([])
  })

  it('SYS-06: says when the browser has no passkeys at all', async () => {
    device.supported = false
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/security', unlockedVault(server))

    await screen.findByRole('heading', { name: 'Password and security' })
    const passkeys = section('Passkeys and Face ID')
    expect(passkeys.getByText(/This browser can't use passkeys/)).toBeInTheDocument()
    expect(passkeys.queryByRole('button', { name: 'Add a passkey' })).not.toBeInTheDocument()
  })

  it('SEC-12: unlocks with Face ID when the account has a passkey', async () => {
    const user = userEvent.setup()
    const server: FakeServer = {
      signedIn: 'ana',
      passkeys: [{ id: 'phone', createdAt: '2026-10-13T12:00:00.000Z', lastUsedAt: null }],
    }
    stubServer(server)
    const vault = fakeVault(server)
    const { router } = renderApp('/unlock', vault)

    await user.click(
      await screen.findByRole('button', { name: 'Unlock with Face ID or a passkey' }),
    )

    expect(vault.openWithPasskey).toHaveBeenCalledWith(
      expect.objectContaining({ challengeId: 'sign-in', response: { id: 'used' } }),
    )
    expect(await screen.findByRole('heading', { name: 'Home', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('SEC-12: offers only the password while the account has no passkey', async () => {
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/unlock', fakeVault(server))

    expect(await screen.findByRole('heading', { name: 'Unlock Mirador' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /passkey/ })).not.toBeInTheDocument()
  })

  it('SYS-06: signs in with a passkey, and says when it was cancelled, in Spanish too', async () => {
    await i18n.changeLanguage('es')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: null }
    stubServer(server)
    let attempts = 0
    const vault = fakeVault(server)
    const opened = vault.openWithPasskey
    vault.openWithPasskey = vi.fn((answer: Parameters<typeof opened>[0]) => {
      attempts += 1
      return attempts === 1 ? Promise.reject(new VaultError('passkey-cancelled')) : opened(answer)
    })
    const { router } = renderApp('/sign-in', vault)

    const button = await screen.findByRole('button', {
      name: 'Iniciar sesión con Face ID o una llave de acceso',
    })
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se usó la llave de acceso. Inténtalo de nuevo cuando quieras.',
    )

    await user.click(button)
    expect(await screen.findByRole('heading', { name: 'Inicio', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})
