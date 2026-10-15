import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../lib/i18n'
import { type FakeServer, renderApp, stubServer, unlockedVault } from '../../test-utils'

describe('settings', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows who is signed in and that the server is connected', async () => {
    await i18n.changeLanguage('en')
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)

    renderApp('/settings', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(await screen.findByText('Signed in as ana')).toBeInTheDocument()
    expect(await screen.findByText('Server connected')).toBeInTheDocument()
  })

  it('says so in Spanish when the server cannot be reached', async () => {
    await i18n.changeLanguage('es')
    const server: FakeServer = { signedIn: 'ana', healthy: false }
    stubServer(server)

    renderApp('/settings', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Configuración' })).toBeInTheDocument()
    expect(await screen.findByText('No se puede conectar con el servidor')).toBeInTheDocument()
  })

  it('SYS-13: offers invites only to the person who runs the server', async () => {
    await i18n.changeLanguage('en')
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/settings', unlockedVault(server))

    expect(await screen.findByRole('link', { name: 'Password and security' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Invite someone' })).not.toBeInTheDocument()
  })

  it('SYS-13: the operator finds invites here', async () => {
    await i18n.changeLanguage('en')
    const server: FakeServer = { signedIn: 'ana', operator: true }
    stubServer(server)
    renderApp('/settings', unlockedVault(server))

    expect(await screen.findByRole('link', { name: 'Invite someone' })).toBeInTheDocument()
  })

  it('SEC-12: locking drops to the unlock screen; signing out to sign in', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const vault = unlockedVault(server)
    renderApp('/settings', vault)

    await user.click(await screen.findByRole('button', { name: 'Lock' }))
    expect(await screen.findByRole('heading', { name: 'Unlock Mirador' })).toBeInTheDocument()
    expect(vault.lock).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(vault.signOut).toHaveBeenCalled()
  })
})
