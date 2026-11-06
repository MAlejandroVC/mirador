import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../lib/i18n'
import { type FakeServer, renderApp, stubServer, unlockedVault } from '../../test-utils'

configure({ asyncUtilTimeout: 5000 })

describe('importing wallets in another currency', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    // An English device guesses dollars for totals.
    vi.spyOn(globalThis.navigator, 'language', 'get').mockReturnValue('en-US')
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('SYS-01, SYS-04, IMP-34: peso wallets from a file offer a rate, a new default currency, or later', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana', records: [] }
    stubServer(server)
    renderApp('/settings/data', unlockedVault(server))
    await screen.findByRole('button', { name: /Import a file/ })

    const csv = [
      'Date,Description,Amount,Currency,Wallet',
      '2026-10-01,Groceries,-850.00,MXN,Nu',
      '2026-10-02,Coffee,-65.50,MXN,Cash',
    ].join('\n')
    const input = document.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('No file input')
    await user.upload(input, new File([csv], 'buddy.csv', { type: 'text/csv' }))

    // Columns, then wallets and categories, then review.
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: /Import 2 transactions/ }))

    const choice = await screen.findByRole('dialog', { name: "MXN isn't your default currency" })
    expect(choice).toHaveAccessibleDescription(
      'Totals are in USD. Until MXN has an exchange rate, its amounts are left out of your net worth and budget.',
    )
    expect(within(choice).getByRole('button', { name: 'Add an exchange rate' })).toBeVisible()
    expect(within(choice).getByRole('button', { name: 'Later' })).toBeVisible()
    await user.click(within(choice).getByRole('button', { name: 'Make MXN your default currency' }))
    await waitFor(() => {
      const preferences = (server.records ?? [])
        .map((record) => record.body)
        .filter((body) => !body.deleted && body.type === 'preferences')
      expect(preferences.map((body) => (body.deleted ? null : body.data))).toEqual([
        { defaultCurrency: 'MXN' },
      ])
    })
  })
})
