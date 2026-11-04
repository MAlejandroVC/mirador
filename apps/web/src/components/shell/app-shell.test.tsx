import { configure, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../lib/i18n'
import { fakeVault, type FakeServer, renderApp, stubServer, unlockedVault } from '../../test-utils'

// Each place is its own chunk (autoCodeSplitting), loaded on first visit, and Budget is a
// full page; on a busy runner that can take longer than the default second.
configure({ asyncUtilTimeout: 5000 })

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

    // The profile picture, after the sidebar's own Settings link.
    const button = (await screen.findAllByRole('link', { name: 'Settings' })).at(-1)
    if (!button) throw new Error('No settings button')
    await user.click(button)
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Budget', level: 1 })).toBeInTheDocument()
  })

  it('DL-CMP-06: back pops the stack, so it returns to the page it came from, never the page just left', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const { router } = renderApp('/budget', unlockedVault(server))

    const button = (await screen.findAllByRole('link', { name: 'Settings' })).at(-1)
    if (!button) throw new Error('No settings button')
    await user.click(button)
    await user.click(await screen.findByRole('link', { name: /Appearance/ }))
    expect(await screen.findByRole('heading', { name: 'Appearance' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Budget', level: 1 })).toBeInTheDocument()
    expect(router.history.location.pathname).toBe('/budget')
  })

  it('DL-CMP-06: a screen opened directly, or from a tab, has nowhere to go back to', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/settings/appearance', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Appearance' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()

    // A tab is a change of place, not a step deeper: it starts a new stack.
    const [tab] = screen.getAllByRole('link', { name: 'Transactions' })
    if (!tab) throw new Error('No Transactions tab')
    await user.click(tab)
    expect(await screen.findByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('DL-CMP-06: a tab page opened from a link has a back button to where it was opened', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const { router } = renderApp('/wallets', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Wallets', level: 1 })).toBeVisible()
    await router.navigate({ to: '/transactions' })
    expect(await screen.findByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Wallets', level: 1 })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
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
