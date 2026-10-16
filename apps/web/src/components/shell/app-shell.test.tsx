import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../lib/i18n'
import { fakeVault, type FakeServer, renderApp, stubServer, unlockedVault } from '../../test-utils'

describe('app shell', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('DL-PAT-01: the four places, in order, with the current one marked', async () => {
    await i18n.changeLanguage('en')
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)

    renderApp('/', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Home', level: 1 })).toBeInTheDocument()
    // The tab bar and the sidebar list the same places (DL-LAY-06); CSS shows one of them.
    for (const nav of screen.getAllByRole('navigation', { name: 'Places' })) {
      const links = within(nav).getAllByRole('link')
      expect(links.map((link) => link.textContent)).toEqual([
        'Home',
        'Transactions',
        'Budget',
        'Wallets',
      ])
      expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute(
        'aria-current',
        'page',
      )
    }
  })

  it('DL-PAT-01: a tab opens its place, in Spanish too', async () => {
    await i18n.changeLanguage('es')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/', unlockedVault(server))

    const [tabBar] = await screen.findAllByRole('navigation', { name: 'Secciones' })
    if (!tabBar) throw new Error('No tab bar')
    for (const name of ['Movimientos', 'Presupuesto', 'Carteras']) {
      await user.click(within(tabBar).getByRole('link', { name }))
      expect(await screen.findByRole('heading', { name, level: 1 })).toBeInTheDocument()
    }
  })

  it('DL-LAY-02: quick-add opens a sheet from every place, and Cancel closes it', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/wallets', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'New transaction' }))
    const sheet = screen.getByRole('dialog', { name: 'New transaction' })
    expect(sheet).toHaveAttribute('open')

    await user.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    expect(sheet).not.toHaveAttribute('open')
  })

  it('Settings opens from the button at the top right', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    const [button] = await screen.findAllByRole('link', { name: 'Settings' })
    if (!button) throw new Error('No settings button')
    await user.click(button)
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Budget', level: 1 })).toBeInTheDocument()
  })

  it('DL-CMP-06: back returns to the page it came from, never to the page just left', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const { router } = renderApp('/budget', unlockedVault(server))

    const [button] = await screen.findAllByRole('link', { name: 'Settings' })
    if (!button) throw new Error('No settings button')
    await user.click(button)
    await user.click(await screen.findByRole('link', { name: /Appearance/ }))
    expect(await screen.findByRole('heading', { name: 'Appearance' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Budget', level: 1 })).toBeInTheDocument()
    expect(router.history.location.pathname).toBe('/budget')
  })

  it('DL-CMP-06: opened directly, back goes to the page above, in its place', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const { router } = renderApp('/settings/appearance', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Home', level: 1 })).toBeInTheDocument()
    expect(router.history.canGoBack()).toBe(false)
  })

  it('SYS-06: sends someone who is signed out to sign in', async () => {
    await i18n.changeLanguage('en')
    const server: FakeServer = { signedIn: null }
    stubServer(server)

    renderApp('/transactions', fakeVault(server))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('SEC-12: asks for the password when signed in but locked, as after a reload', async () => {
    await i18n.changeLanguage('en')
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)

    renderApp('/wallets', fakeVault(server))

    expect(await screen.findByRole('heading', { name: 'Unlock Mirador' })).toBeInTheDocument()
  })
})
