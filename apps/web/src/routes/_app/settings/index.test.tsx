import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../lib/i18n'
import { type FakeServer, renderApp, stubServer, unlockedVault } from '../../../test-utils'

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
    expect(await screen.findByRole('link', { name: /^ana/ })).toHaveAttribute(
      'href',
      '/settings/account',
    )
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
    expect(screen.getByRole('link', { name: 'Appearance' })).toBeInTheDocument()
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

  it('SYS-18: picks a profile picture, saved as an encrypted record and shown on every tab', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const vault = unlockedVault(server)
    renderApp('/settings/account', vault)
    // The suggested categories a new account starts with (CAT-04) are saved too.
    const profiles = () => (server.records ?? []).filter((item) => item.body.type === 'profile')

    const initial = await screen.findByRole('radio', { name: 'Your initial' })
    expect(initial).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('radio', { name: 'Cat' }))

    await vi.waitFor(() => {
      expect(profiles()[0]?.body).toEqual({
        deleted: false,
        type: 'profile',
        schema: 1,
        data: { picture: 'cat' },
      })
    })
    expect(screen.getByRole('radio', { name: 'Cat' })).toHaveAttribute('aria-checked', 'true')
    // Picking again changes the same record rather than adding one.
    await user.click(screen.getByRole('radio', { name: 'Dog' }))
    await vi.waitFor(() => {
      expect(profiles()).toHaveLength(1)
      expect(profiles()[0]?.body).toMatchObject({ data: { picture: 'dog' } })
    })
    // The username and deleting the account live here too.
    expect(screen.getByRole('region', { name: 'Username' })).toBeInTheDocument()
  })

  it('SYS-16, SYS-17: changes the mode and the palette at once and keeps them on this device', async () => {
    await i18n.changeLanguage('es')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/settings/appearance', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Oscuro' }))
    await user.click(screen.getByRole('radio', { name: 'Jacaranda' }))

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveAttribute('data-palette', 'jacaranda')
    expect(screen.getByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(localStorage.getItem('mirador.appearance') ?? '{}')).toEqual({
      mode: 'dark',
      palette: 'jacaranda',
    })

    await user.click(screen.getByRole('button', { name: 'Automático' }))
    expect(document.documentElement).not.toHaveAttribute('data-theme')
    localStorage.clear()
  })

  it('opens each page with a header card and a round back button to Settings', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const { router } = renderApp('/settings/appearance', unlockedVault(server))

    const title = await screen.findByRole('heading', { name: 'Appearance', level: 1 })
    expect(title.closest('header')).toHaveTextContent(
      "Choose light or dark and the app's colors on this device.",
    )
    const back = screen.getByRole('button', { name: 'Settings' })
    expect(back).not.toHaveTextContent('Settings')
    await user.click(back)
    expect(router.state.location.pathname).toBe('/settings')
  })

  it('SYS-19: switches the language at once from Settings > Language and keeps it', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/settings', unlockedVault(server))

    await user.click(await screen.findByRole('link', { name: /^Language/ }))
    expect(await screen.findByRole('heading', { name: 'Language', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^Automatic/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await user.click(screen.getByRole('radio', { name: /^Español/ }))

    expect(await screen.findByRole('heading', { name: 'Idioma', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^Español/ })).toHaveAttribute('aria-checked', 'true')
    expect(localStorage.getItem('mirador.language')).toBe('es')
    expect(document.documentElement.lang).toBe('es')
    localStorage.clear()
    await i18n.changeLanguage('en')
  })
})
