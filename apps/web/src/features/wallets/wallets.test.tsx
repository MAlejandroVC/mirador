import {
  type RecordBody,
  transactionKinds,
  walletFeatures,
  walletPresets,
  type WalletRecord,
} from '@repo/api'
import { openingBalance, presetDefaults } from '@repo/core'
import { newRecordId } from '@repo/crypto'
import type { SyncedRecord } from '@repo/sync'
import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../lib/i18n'
import { type FakeServer, renderApp, stubServer, unlockedVault } from '../../test-utils'
import { transactionBody, walletBody } from './use-ledger'
import { newWalletRecord, withPreset } from './wallet-look'

function wallet(name: string, extra: Partial<WalletRecord> = {}): SyncedRecord {
  return {
    id: newRecordId(),
    revision: 1,
    body: walletBody({ ...newWalletRecord(name, 'MXN'), ...extra }),
  }
}

function opening(walletId: string, amount: number, date = '2026-10-01'): SyncedRecord {
  return {
    id: newRecordId(),
    revision: 1,
    body: transactionBody(openingBalance(walletId, amount, date)),
  }
}

function saved(server: FakeServer, type: string) {
  return (server.records ?? [])
    .map((record) => record.body)
    .filter((body): body is Extract<RecordBody, { deleted: false }> => !body.deleted)
    .filter((body) => body.type === type)
}

// Whole pesos in, minor units out.
const pesos = (amount: number) => amount * 100

// The first test pays for loading the wallet screens and decrypting records, which can
// take longer than Testing Library's 1 s default on a busy CI runner.
configure({ asyncUtilTimeout: 5000 })

describe('wallets', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.spyOn(globalThis.navigator, 'language', 'get').mockReturnValue('es-MX')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('WAL-11, WAL-12: the record schema and the logic agree on presets, features and kinds', () => {
    expect([...walletPresets].sort()).toEqual(Object.keys(presetDefaults).sort())
    for (const preset of walletPresets)
      for (const feature of presetDefaults[preset].features)
        expect(walletFeatures).toContain(feature)
    expect(transactionKinds).toEqual([
      'openingBalance',
      'adjustment',
      'interest',
      'fee',
      'valuation',
      'expense',
      'income',
      'transfer',
    ])
  })

  it('DL-CMP-14: with no wallets yet, the empty state offers to add one', async () => {
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/wallets', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'A clear view starts here' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add a wallet' })).toBeVisible()
  })

  it('WAL-02, WAL-05: a new wallet needs only a name; its balance is an opening transaction', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/wallets', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Add a wallet' }))
    const save = screen.getByRole('button', { name: 'Save' })
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'BBVA')
    await user.click(screen.getByRole('radio', { name: 'Debit' }))
    await user.type(screen.getByRole('textbox', { name: 'Balance today' }), '3,250.50')
    await user.click(save)

    await waitFor(() => {
      expect(saved(server, 'wallet')).toHaveLength(1)
    })
    const [created] = saved(server, 'wallet')
    // SYS-01: the currency is the default, guessed from the device until it is set.
    expect(created?.data).toMatchObject({
      name: 'BBVA',
      preset: 'checking',
      currency: 'MXN',
      features: ['fees', 'liquid'],
      active: true,
    })
    expect(saved(server, 'transaction').map((body) => body.data)).toEqual([
      expect.objectContaining({ kind: 'openingBalance', amount: 325050 }),
    ])
    expect(await screen.findByRole('link', { name: /BBVA/ })).toBeVisible()
    expect(screen.getByText('Across 1 wallet · $3,250.50 available now')).toBeVisible()
  })

  it('WAL-11: a credit card starts on "I owe", so its balance is saved as negative', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/wallets', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Add a wallet' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Nu')
    await user.click(screen.getByRole('radio', { name: 'Credit card' }))
    expect(screen.getByRole('button', { name: 'I owe' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByRole('textbox', { name: 'Balance today' }), '1250')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(saved(server, 'transaction').map((body) => body.data)).toEqual([
        expect.objectContaining({ amount: -125000 }),
      ])
    })
    // DL-NUM-03: a negative balance shows the true minus.
    expect(await screen.findByText('What you owe')).toBeVisible()
    expect(screen.getAllByText('−$1,250.00').length).toBeGreaterThan(0)
  })

  it('WAL-20: net worth and net debt, as in the spec example', async () => {
    const records: SyncedRecord[] = []
    const balances: [string, (typeof walletPresets)[number], number][] = [
      ['Savings', 'savings', 100126],
      ['Cash', 'cash', 3270],
      ['Vouchers', 'voucher', 2125],
      ['Card 1', 'creditCard', -26836],
      ['Card 2', 'creditCard', -21829],
      ['Card 3', 'creditCard', -3555],
    ]
    for (const [name, preset, amount] of balances) {
      const record = wallet(name, withPreset(newWalletRecord(name, 'MXN'), preset))
      records.push(record, opening(record.id, pesos(amount)))
    }
    const server: FakeServer = { signedIn: 'ana', records }
    stubServer(server)
    renderApp('/wallets', unlockedVault(server))

    expect(await screen.findByText('$53,301.00')).toBeInTheDocument()
    expect(screen.getByText('$52,220.00')).toBeVisible()
    expect(screen.getByText('$105,521.00')).toBeVisible()
  })

  it('WAL-21: what I have and what I owe, by wallet or by type', async () => {
    const user = userEvent.setup()
    const a = wallet('Savings A', { preset: 'savings' })
    const b = wallet('Savings B', { preset: 'savings' })
    const c = wallet('Cash', { preset: 'cash' })
    const server: FakeServer = {
      signedIn: 'ana',
      records: [a, b, c, opening(a.id, 500), opening(b.id, 250), opening(c.id, 250)],
    }
    stubServer(server)
    renderApp('/wallets', unlockedVault(server))

    expect(await screen.findByText('Savings · 50%')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Types' }))
    expect(screen.getByText('2 wallets · 75%')).toBeVisible()
    expect(screen.getByText('1 wallet · 25%')).toBeVisible()
  })

  it('WAL-04, WAL-09: inactive wallets still count; excluded ones are marked and left out', async () => {
    const active = wallet('Cash')
    const inactive = wallet('Old card', { active: false })
    const excluded = wallet('Pension', { inNetWorth: false })
    const server: FakeServer = {
      signedIn: 'ana',
      records: [
        active,
        inactive,
        excluded,
        opening(active.id, pesos(100)),
        opening(inactive.id, pesos(50)),
        opening(excluded.id, pesos(900)),
      ],
    }
    stubServer(server)
    renderApp('/wallets', unlockedVault(server))

    // Net worth and what I have: the inactive wallet counts, the excluded one doesn't.
    expect(await screen.findAllByText('$150.00')).toHaveLength(2)
    expect(screen.getByText('Other · 33% · Inactive')).toBeVisible()
    expect(screen.getByText('Other · Not in net worth')).toBeVisible()
  })

  it('WAL-07: a different actual balance is recorded as an adjustment', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const server: FakeServer = { signedIn: 'ana', records: [cash, opening(cash.id, pesos(100))] }
    stubServer(server)
    renderApp(`/wallets/${cash.id}`, unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Update balance' }))
    expect(screen.getByText('Mirador has $100.00. Type the balance you see now.')).toBeVisible()
    await user.type(screen.getByRole('textbox', { name: 'Balance now' }), '80')
    expect(screen.getByText('An adjustment of −$20.00 will be added today.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }))

    await waitFor(() => {
      expect(saved(server, 'transaction').map((body) => body.data)).toContainEqual(
        expect.objectContaining({ kind: 'adjustment', walletId: cash.id, amount: -2000 }),
      )
    })
    expect(await screen.findByRole('button', { name: /Balance adjustment/ })).toBeVisible()
  })

  it('WAL-07: the same balance needs no adjustment', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const server: FakeServer = { signedIn: 'ana', records: [cash, opening(cash.id, pesos(100))] }
    stubServer(server)
    renderApp(`/wallets/${cash.id}`, unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Update balance' }))
    await user.type(screen.getByRole('textbox', { name: 'Balance now' }), '100')
    expect(screen.getByText("That's what Mirador has. Nothing to adjust.")).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }))
    // No adjustment is recorded, and the sheet closes: only the opening balance is
    // there. The wallet remembers it was checked today (DSH-05).
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Balance now' })).toBeNull()
    })
    expect(saved(server, 'transaction')).toHaveLength(1)
    const checked = saved(server, 'wallet').at(-1)?.data as { checkedOn?: string } | undefined
    expect(checked?.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('WAL-05: the opening balance can be moved to an earlier date and amount', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const first = opening(cash.id, pesos(100), '2026-10-01')
    const server: FakeServer = { signedIn: 'ana', records: [cash, first] }
    stubServer(server)
    renderApp(`/wallets/${cash.id}`, unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: /Opening balance/ }))
    const amount = screen.getByRole('textbox', { name: 'Amount' })
    await user.clear(amount)
    await user.type(amount, '40')
    // DL-CMP-09: the date is picked from a calendar, a month at a time.
    await user.click(screen.getByRole('button', { name: /Date/ }))
    expect(screen.getByText('October 2026')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(screen.getByRole('button', { name: /August 31, 2026/ }))
    expect(screen.getByRole('button', { name: /Date/ })).toHaveTextContent('Aug 31, 2026')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(server.records?.find((record) => record.id === first.id)?.body).toMatchObject({
        data: { kind: 'openingBalance', amount: 4000, date: '2026-08-31' },
      })
    })
  })

  it('WAL-03, WAL-19, WAL-23: editing sets active, liquid, icon and color', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const server: FakeServer = { signedIn: 'ana', records: [cash] }
    stubServer(server)
    renderApp(`/wallets/${cash.id}`, unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('radio', { name: 'Car' }))
    await user.click(screen.getByRole('radio', { name: 'Berry' }))
    // Features show only the ones on, until "Show all features" (DL-CMP-15).
    expect(screen.queryByRole('switch', { name: /Available now/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show all features' }))
    await user.click(screen.getByRole('switch', { name: /Available now/ }))
    await user.click(screen.getByRole('switch', { name: /Active/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(saved(server, 'wallet')[0]?.data).toMatchObject({
        icon: 'car',
        color: 'berry',
        features: ['liquid'],
        active: false,
      })
    })
  })

  it('WAL-08: deleting a wallet with transactions offers inactive and names the cost', async () => {
    const user = userEvent.setup()
    const card = wallet('Nu', { preset: 'creditCard' })
    const server: FakeServer = {
      signedIn: 'ana',
      records: [card, opening(card.id, -500), opening(card.id, -300)],
    }
    stubServer(server)
    renderApp(`/wallets/${card.id}`, unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Delete wallet' }))
    const sheet = screen.getByRole('dialog', { name: 'Delete Nu?' })
    expect(
      within(sheet).getByText("This also deletes its 2 transactions. This can't be undone."),
    ).toBeVisible()
    await user.click(within(sheet).getByRole('button', { name: 'Make it inactive instead' }))

    await waitFor(() => {
      expect(saved(server, 'wallet')[0]?.data).toMatchObject({ name: 'Nu', active: false })
    })
    expect(saved(server, 'transaction')).toHaveLength(2)
  })

  it('WAL-08: confirming deletes the wallet and its transactions', async () => {
    const user = userEvent.setup()
    const card = wallet('Nu')
    const server: FakeServer = { signedIn: 'ana', records: [card, opening(card.id, -500)] }
    stubServer(server)
    const { router } = renderApp(`/wallets/${card.id}`, unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Delete wallet' }))
    const sheet = screen.getByRole('dialog', { name: 'Delete Nu?' })
    await user.click(within(sheet).getByRole('button', { name: 'Delete wallet' }))

    await waitFor(() => {
      expect(saved(server, 'wallet')).toHaveLength(0)
    })
    expect(saved(server, 'transaction')).toHaveLength(0)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/wallets')
    })
  })

  it('DL-PAT-06: a wallet with nothing in it is deleted at once, with Undo', async () => {
    const user = userEvent.setup()
    const empty = wallet('Spare')
    const server: FakeServer = { signedIn: 'ana', records: [empty] }
    stubServer(server)
    renderApp(`/wallets/${empty.id}`, unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Delete wallet' }))
    expect(await screen.findByText('Spare deleted')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(() => {
      expect(saved(server, 'wallet')[0]?.data).toMatchObject({ name: 'Spare' })
    })
  })

  it('DL-PAT-02: a missing name is pointed out only when Save is tapped', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/wallets', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Add a wallet' }))
    const name = screen.getByRole('textbox', { name: 'Name' })
    // Leaving the empty field says nothing.
    await user.click(name)
    await user.click(screen.getByRole('radio', { name: 'Savings' }))
    expect(name).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).toBeNull()

    // Save stays tappable; tapping it marks the name and saves nothing.
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Give the wallet a name.')
    expect(name).toHaveFocus()
    expect(saved(server, 'wallet')).toHaveLength(0)

    // Filling it in clears the mark.
    await user.type(name, 'Nu')
    expect(name).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('SYS-01: the currency list shows the common currencies, and the rest on Show all', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/settings/currency', unlockedVault(server))

    expect(await screen.findByRole('radio', { name: 'US Dollar (USD)' })).toBeVisible()
    expect(screen.queryByRole('radio', { name: 'Swiss Franc (CHF)' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Show all currencies' }))
    await user.click(screen.getByRole('radio', { name: 'Swiss Franc (CHF)' }))
    await waitFor(() => {
      expect(saved(server, 'preferences').map((body) => body.data)).toEqual([
        { defaultCurrency: 'CHF' },
      ])
    })
    // Folded again, the chosen currency stays in view.
    await user.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(screen.getByRole('radio', { name: 'Swiss Franc (CHF)' })).toBeChecked()
    expect(screen.queryByRole('radio', { name: 'Japanese Yen (JPY)' })).toBeNull()
  })

  it('SYS-01: the default currency is chosen in Settings and new wallets start with it', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const { router } = renderApp('/settings/currency', unlockedVault(server))

    await user.click(await screen.findByRole('radio', { name: 'US Dollar (USD)' }))
    await waitFor(() => {
      expect(saved(server, 'preferences').map((body) => body.data)).toEqual([
        { defaultCurrency: 'USD' },
      ])
    })
    await router.navigate({ to: '/wallets' })
    await user.click(await screen.findByRole('button', { name: 'Add a wallet' }))
    expect(screen.getByRole('button', { name: /Currency.*US Dollar/ })).toBeVisible()
  })

  it('WAL-02: picking a currency in its own sheet keeps the wallet form open', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/wallets', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Add a wallet' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Trip')
    await user.click(screen.getByRole('button', { name: /Currency/ }))
    await user.click(await screen.findByRole('radio', { name: 'US Dollar (USD)' }))

    // The wallet sheet is still there, with no "discard changes?" prompt.
    expect(screen.queryByRole('button', { name: 'Discard changes' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Trip')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(saved(server, 'wallet')[0]?.data).toMatchObject({ name: 'Trip', currency: 'USD' })
    })
  })

  it('SYS-10: speaks Spanish with Mexican words', async () => {
    await i18n.changeLanguage('es')
    const cash = wallet('Efectivo', { preset: 'cash' })
    const server: FakeServer = { signedIn: 'ana', records: [cash, opening(cash.id, pesos(260))] }
    stubServer(server)
    renderApp('/wallets', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Carteras' })).toBeVisible()
    expect(await screen.findByText('Patrimonio')).toBeVisible()
    expect(screen.getByText('Lo que tienes')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Agregar cartera' })).toBeVisible()
  })
})
