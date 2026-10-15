import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../lib/i18n'
import { type FakeServer, renderApp, stubServer, unlockedVault } from '../../../test-utils'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('invites', () => {
  it('SYS-13: the operator makes an invite link from Settings and sees it listed', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana', operator: true }
    stubServer(server)
    const { router } = renderApp('/settings', unlockedVault(server))

    await user.click(await screen.findByRole('link', { name: 'Invite someone' }))
    expect(await screen.findByRole('heading', { name: 'Invites' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/invites')
    expect(screen.getByText('No invites yet.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Make an invite link' }))

    const made = within(await screen.findByRole('region', { name: 'New invite link' }))
    expect(
      made.getByText(`${window.location.origin}/sign-up?invite=ABCD-EFGH-JKMN-PQRS-TV23`),
    ).toBeInTheDocument()
    expect(made.getByText(/shown only once/)).toBeInTheDocument()
    expect(await screen.findByText(/^Waiting, expires/)).toBeInTheDocument()
  })

  it('SYS-13: shares the invite link with a line about what Mirador is', async () => {
    const user = userEvent.setup()
    const share = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    try {
      const server: FakeServer = { signedIn: 'ana', operator: true }
      stubServer(server)
      renderApp('/invites', unlockedVault(server))

      await user.click(await screen.findByRole('button', { name: 'Make an invite link' }))
      const made = within(await screen.findByRole('region', { name: 'New invite link' }))
      await user.click(made.getByRole('button', { name: 'Share' }))

      expect(share).toHaveBeenCalledWith({
        title: 'Mirador',
        text: 'Track your expenses and plan your future with Mirador Budget:',
        url: `${window.location.origin}/sign-up?invite=ABCD-EFGH-JKMN-PQRS-TV23`,
      })
    } finally {
      Reflect.deleteProperty(navigator, 'share')
    }
  })

  it('SYS-13: shows who used an invite, and withdraws one still waiting', async () => {
    const user = userEvent.setup()
    const server: FakeServer = {
      signedIn: 'ana',
      operator: true,
      invites: [
        {
          id: 'waiting',
          createdAt: '2026-10-13T12:00:00.000Z',
          expiresAt: '2099-10-20T12:00:00.000Z',
          usedAt: null,
          usedBy: null,
        },
        {
          id: 'used',
          createdAt: '2026-10-01T12:00:00.000Z',
          expiresAt: '2026-10-08T12:00:00.000Z',
          usedAt: '2026-10-02T12:00:00.000Z',
          usedBy: 'ben',
        },
        {
          id: 'expired',
          createdAt: '2026-09-01T12:00:00.000Z',
          expiresAt: '2026-09-08T12:00:00.000Z',
          usedAt: null,
          usedBy: null,
        },
      ],
    }
    stubServer(server)
    renderApp('/invites', unlockedVault(server))

    expect(await screen.findByText('Used by ben on Oct 2, 2026')).toBeInTheDocument()
    expect(screen.getByText('Expired on Sep 8, 2026')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Withdraw' }))

    await vi.waitFor(() => {
      expect(screen.queryByText(/^Waiting/)).not.toBeInTheDocument()
    })
    expect(server.invites?.map((invite) => invite.id)).toEqual(['used', 'expired'])
  })

  it('SYS-13: someone who does not run the server has no invites', async () => {
    const server: FakeServer = { signedIn: 'ben', operator: false }
    stubServer(server)
    const { router } = renderApp('/invites', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Home', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.queryByRole('link', { name: 'Invite someone' })).not.toBeInTheDocument()
  })

  it('SYS-13: in Spanish too', async () => {
    await i18n.changeLanguage('es')
    const server: FakeServer = { signedIn: 'ana', operator: true }
    stubServer(server)
    renderApp('/invites', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Invitaciones' })).toBeInTheDocument()
    expect(screen.getByText(/durante 7 días/)).toBeInTheDocument()
  })
})
