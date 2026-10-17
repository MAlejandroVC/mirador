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

const operator = {
  id: '1',
  username: 'ana',
  operator: true,
  joinedAt: '2026-10-01T12:00:00.000Z',
  deletesAt: null,
}
const ben = {
  id: '2',
  username: 'ben',
  operator: false,
  joinedAt: '2026-10-02T12:00:00.000Z',
  deletesAt: null,
}

function lastSheet() {
  const dialogs = screen.getAllByRole('dialog')
  return within(dialogs[dialogs.length - 1]!)
}

describe('people', () => {
  it('SYS-21: the operator makes a link for a group, with its expiry and how many can join', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana', operator: true, people: [operator] }
    stubServer(server)
    const { router } = renderApp('/settings', unlockedVault(server))

    await user.click(await screen.findByRole('link', { name: 'People' }))
    expect(await screen.findByRole('heading', { name: 'People', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/settings/people')

    await user.click(screen.getByRole('button', { name: 'New invite link' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'New invite link' }))
    // Ready to make from the start: a week, for one person.
    expect(sheet.getByText(/^One person can join with this link until/)).toBeInTheDocument()

    await user.click(sheet.getByRole('button', { name: /Who can join/ }))
    await user.click(lastSheet().getByRole('radio', { name: 'Up to 25 people' }))
    expect(sheet.getByText(/^Up to 25 people can join with this link until/)).toBeInTheDocument()
    await user.click(sheet.getByRole('button', { name: 'Make link' }))

    const made = within(await screen.findByRole('region', { name: 'Your invite link' }))
    expect(
      made.getByText(`${window.location.origin}/sign-up?invite=ABCD-EFGH-JKMN-PQRS-TV23`),
    ).toBeInTheDocument()
    expect(made.getByText(/shown only once/)).toBeInTheDocument()
    expect(server.invites?.[0]?.maxUses).toBe(25)
    const expiresIn = Date.parse(server.invites?.[0]?.expiresAt ?? '') - Date.now()
    expect(expiresIn).toBeGreaterThan(7 * 24 * 60 * 60 * 1000)
    expect(expiresIn).toBeLessThanOrEqual(8 * 24 * 60 * 60 * 1000)
    expect(await screen.findByRole('button', { name: /0 of 25 joined/ })).toBeInTheDocument()
  })

  it('SYS-21: a link with no limit', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana', operator: true, people: [operator] }
    stubServer(server)
    renderApp('/settings/people', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'New invite link' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'New invite link' }))
    await user.click(sheet.getByRole('button', { name: /Who can join/ }))
    await user.click(lastSheet().getByRole('radio', { name: 'No limit' }))
    expect(sheet.getByText(/^Anyone with this link can join until/)).toBeInTheDocument()
    await user.click(sheet.getByRole('button', { name: 'Make link' }))

    expect(await screen.findByRole('region', { name: 'Your invite link' })).toBeInTheDocument()
    expect(server.invites?.[0]?.maxUses).toBeNull()
  })

  it('SYS-21: shows who joined through a link, and ends it early', async () => {
    const user = userEvent.setup()
    const server: FakeServer = {
      signedIn: 'ana',
      operator: true,
      people: [operator, ben],
      invites: [
        {
          id: 'friends',
          createdAt: '2026-10-13T12:00:00.000Z',
          expiresAt: '2099-10-20T12:00:00.000Z',
          endedAt: null,
          maxUses: 10,
          useCount: 2,
          joined: ['ben', 'cleo'],
        },
        {
          id: 'old',
          createdAt: '2026-09-01T12:00:00.000Z',
          expiresAt: '2026-09-08T12:00:00.000Z',
          endedAt: null,
          maxUses: 1,
          useCount: 0,
          joined: [],
        },
      ],
    }
    stubServer(server)
    renderApp('/settings/people', unlockedVault(server))

    expect(await screen.findByText('Expired Sep 8, 2026')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /2 of 10 joined/ }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Invite link' }))
    expect(sheet.getByText('cleo')).toBeInTheDocument()

    await user.click(sheet.getByRole('button', { name: 'End link now' }))
    await user.click(await screen.findByRole('button', { name: 'End link' }))

    await vi.waitFor(() => {
      expect(server.invites?.[0]?.endedAt).not.toBeNull()
    })
    expect(await sheet.findByText(/^Ended/)).toBeInTheDocument()
    expect(sheet.queryByRole('button', { name: 'End link now' })).not.toBeInTheDocument()
  })

  it('SYS-22: the operator removes someone after a confirmation, and can restore them', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana', operator: true, people: [operator, ben] }
    stubServer(server)
    renderApp('/settings/people', unlockedVault(server))

    // The operator's own row offers nothing: they can't remove themselves.
    expect(await screen.findByText('You run this server')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^ana/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^ben/ }))
    expect(await screen.findByText(/For 30 days they can sign in only to download/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove ben' }))

    expect(await screen.findByText(/^Removed. Deleted on/)).toBeInTheDocument()
    expect(server.people?.[1]?.deletesAt).not.toBeNull()

    await user.click(screen.getByRole('button', { name: /^ben/ }))
    await user.click(await screen.findByRole('button', { name: 'Restore access' }))
    expect(await screen.findByText(/^Joined/)).toBeInTheDocument()
    expect(server.people?.[1]?.deletesAt).toBeNull()
  })

  it('SYS-22: someone who does not run the server has no People page', async () => {
    const server: FakeServer = { signedIn: 'ben', operator: false }
    stubServer(server)
    const { router } = renderApp('/settings/people', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Home', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.queryByRole('link', { name: 'People' })).not.toBeInTheDocument()
  })

  it('SYS-21: in Spanish too', async () => {
    await i18n.changeLanguage('es')
    const server: FakeServer = { signedIn: 'ana', operator: true, people: [operator] }
    stubServer(server)
    renderApp('/settings/people', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Personas', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Tú administras este servidor')).toBeInTheDocument()
  })
})
