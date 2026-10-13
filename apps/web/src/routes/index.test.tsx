import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../lib/i18n'
import { fakeVault, type FakeServer, renderApp, stubServer, unlockedVault } from '../test-utils'

describe('home page', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows who is signed in and that the server is connected', async () => {
    await i18n.changeLanguage('en')
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)

    renderApp('/', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Mirador' })).toBeInTheDocument()
    expect(await screen.findByText('Signed in as ana')).toBeInTheDocument()
    expect(await screen.findByText('Server connected')).toBeInTheDocument()
  })

  it('says so in Spanish when the server cannot be reached', async () => {
    await i18n.changeLanguage('es')
    const server: FakeServer = { signedIn: 'ana', healthy: false }
    stubServer(server)

    renderApp('/', unlockedVault(server))

    expect(await screen.findByText('No se puede conectar con el servidor')).toBeInTheDocument()
  })

  it('SYS-06: sends someone who is signed out to sign in', async () => {
    await i18n.changeLanguage('en')
    const server: FakeServer = { signedIn: null }
    stubServer(server)

    renderApp('/', fakeVault(server))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('SEC-12: asks for the password when signed in but locked, as after a reload', async () => {
    await i18n.changeLanguage('en')
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)

    renderApp('/', fakeVault(server))

    expect(await screen.findByRole('heading', { name: 'Unlock Mirador' })).toBeInTheDocument()
  })

  it('SEC-12: locking drops to the unlock screen; signing out to sign in', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const vault = unlockedVault(server)
    renderApp('/', vault)

    await user.click(await screen.findByRole('button', { name: 'Lock' }))
    expect(await screen.findByRole('heading', { name: 'Unlock Mirador' })).toBeInTheDocument()
    expect(vault.lock).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(vault.signOut).toHaveBeenCalled()
  })
})
