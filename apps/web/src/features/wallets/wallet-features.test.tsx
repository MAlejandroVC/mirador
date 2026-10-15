import type { RecordBody, WalletRecord } from '@repo/api'
import { openingBalance } from '@repo/core'
import { newRecordId } from '@repo/crypto'
import type { SyncedRecord } from '@repo/sync'
import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../lib/i18n'
import { type FakeServer, renderApp, stubServer, unlockedVault } from '../../test-utils'
import { exchangeRateBody, transactionBody, walletBody } from './use-ledger'
import { newWalletRecord } from './wallet-look'

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

function savedWallet(server: FakeServer, name: string) {
  return saved(server, 'wallet')
    .map((body) => body.data as WalletRecord)
    .find((data) => data.name === name)
}

function start(records: SyncedRecord[], path: string) {
  const server: FakeServer = { signedIn: 'ana', records }
  stubServer(server)
  const app = renderApp(path, unlockedVault(server))
  return { server, ...app }
}

configure({ asyncUtilTimeout: 5000 })

describe('wallet features, exchange rates and order', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.spyOn(globalThis.navigator, 'language', 'get').mockReturnValue('es-MX')
    // Only the clock is fake, so "today" is Oct 15, 2026 and timers still run.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 15, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('WAL-10: wallets can be put in another order, which is saved', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const savings = wallet('Savings')
    start([cash, savings], '/wallets')

    await user.click(await screen.findByRole('button', { name: 'Reorder wallets' }))
    const sheet = screen.getByRole('dialog', { name: 'Reorder wallets' })
    within(sheet).getByRole('button', { name: 'Move Savings' }).focus()
    await user.keyboard('{ArrowUp}')
    expect(within(sheet).getByRole('status')).toHaveTextContent('Savings moved to 1 of 2')
    await user.click(within(sheet).getByRole('button', { name: 'Done' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Reorder wallets' })).toBeNull()
    })
    const links = screen
      .getAllByRole('link')
      .filter((link) => /Cash|Savings/.test(link.textContent))
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining('Savings'),
      expect.stringContaining('Cash'),
    ])
  })

  it('SYS-04: a wallet in another currency asks for its rate, then counts in net worth', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const { server } = start([cash, opening(cash.id, 100_000)], '/wallets')

    await user.click(await screen.findByRole('button', { name: 'Add a wallet' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Dollars')
    await user.type(screen.getByRole('textbox', { name: 'Balance today' }), '100')
    await user.click(screen.getByRole('button', { name: /Currency/ }))
    await user.click(await screen.findByRole('radio', { name: 'US Dollar (USD)' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const prompt = await screen.findByRole('dialog', { name: 'Exchange rate' })
    await user.type(within(prompt).getByRole('textbox', { name: '1 USD =' }), '18.45')
    await user.click(within(prompt).getByRole('button', { name: 'Save rate' }))

    await waitFor(() => {
      expect(saved(server, 'exchangeRate').map((body) => body.data)).toEqual([
        { from: 'USD', to: 'MXN', rate: 18_450_000, date: '2026-10-15' },
      ])
    })
    // 1,000.00 MXN plus 100.00 USD at 18.45.
    expect((await screen.findAllByText('$2,845.00')).length).toBeGreaterThan(0)
    // The rate is the wallet's business, on its own page (and in Settings).
    expect(screen.queryByText(/1 USD =/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /Dollars/ }))
    expect(await screen.findByText('About $1,845.00')).toBeVisible()
    expect(screen.getByText('1 USD = 18.45 MXN · Today')).toBeVisible()
  })

  it('SYS-04: the rate can wait; until then the wallet is listed apart', async () => {
    const user = userEvent.setup()
    start([], '/wallets')

    await user.click(await screen.findByRole('button', { name: 'Add a wallet' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Euros')
    await user.click(screen.getByRole('button', { name: /Currency/ }))
    await user.click(await screen.findByRole('radio', { name: 'Euro (EUR)' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const prompt = await screen.findByRole('dialog', { name: 'Exchange rate' })
    await user.click(within(prompt).getByRole('button', { name: 'Later' }))

    expect(await screen.findByText(/No exchange rate/)).toBeVisible()
    await user.click(screen.getByRole('link', { name: /Euros/ }))
    await user.click(
      await screen.findByRole('button', {
        name: /No exchange rate yet, so it isn't in your net worth/,
      }),
    )
    expect(await screen.findByRole('dialog', { name: 'Exchange rate' })).toBeVisible()
  })

  it('SYS-05: Settings > Currency shows each rate with its date and keeps the history', async () => {
    const user = userEvent.setup()
    const dollars = wallet('Dollars', { currency: 'USD' })
    const rate = (value: number, date: string): SyncedRecord => ({
      id: newRecordId(),
      revision: 1,
      body: exchangeRateBody({ from: 'USD', to: 'MXN', rate: value, date }),
    })
    const { server } = start(
      [dollars, rate(18_200_000, '2026-09-01'), rate(18_450_000, '2026-10-01')],
      '/settings/currency',
    )

    await user.click(await screen.findByRole('button', { name: /US Dollar/ }))
    expect(screen.getByRole('button', { name: /1 USD = 18\.45 MXN.*In use/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /1 USD = 18\.20 MXN/ })).toBeVisible()
    const field = screen.getByRole('textbox', { name: '1 USD =' })
    await user.clear(field)
    await user.type(field, '18.6')
    await user.click(screen.getByRole('button', { name: 'Save rate' }))
    await waitFor(() => {
      expect(saved(server, 'exchangeRate')).toHaveLength(3)
    })
    expect(await screen.findByText(/1 USD = 18\.60 MXN · Today/)).toBeVisible()
  })

  it('WAL-13, WAL-14: interest is set up on the wallet page, estimated, and recorded', async () => {
    const user = userEvent.setup()
    const savings = wallet('Savings', { preset: 'savings', features: ['interest', 'liquid'] })
    const { server } = start([savings, opening(savings.id, 1_000_000)], `/wallets/${savings.id}`)

    await user.click(await screen.findByRole('button', { name: 'Set up' }))
    await user.type(screen.getByRole('textbox', { name: 'Rate a year' }), '10')
    // Savings start on the GAT, which Mexican banks quote for savings.
    expect(screen.getByRole('button', { name: 'Effective (GAT)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(savedWallet(server, 'Savings')?.interest).toEqual({
        rate: 1000,
        type: 'effective',
        compounding: 'daily',
      })
    })

    // 10,000.00 at a 10% GAT over October's 31 days.
    expect(await screen.findByText('$81.28')).toBeVisible()
    expect(screen.getByText('10% a year, effective (GAT)')).toBeVisible()
    await user.click(screen.getByRole('button', { name: "Record this month's interest" }))
    await user.click(screen.getByRole('button', { name: 'Record' }))
    await waitFor(() => {
      expect(saved(server, 'transaction').map((body) => body.data)).toContainEqual(
        expect.objectContaining({ kind: 'interest', amount: 8128, date: '2026-10-15' }),
      )
    })
    expect(await screen.findByText('Recorded this month: +$81.28')).toBeVisible()
  })

  it('WAL-15: fees are added, offered when charged, and confirmed as transactions', async () => {
    const user = userEvent.setup()
    const checking = wallet('Checking', {
      preset: 'checking',
      features: ['fees', 'liquid'],
      fees: [{ id: 'f1', name: 'Account fee', amount: 9_900, every: 'month', start: '2026-10-01' }],
    })
    const { server } = start([checking, opening(checking.id, 500_000)], `/wallets/${checking.id}`)

    expect(await screen.findByText('Oct 1 · to confirm')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(saved(server, 'transaction').map((body) => body.data)).toContainEqual(
        expect.objectContaining({
          kind: 'fee',
          amount: -9_900,
          date: '2026-10-01',
          note: 'Account fee',
        }),
      )
    })
    await waitFor(() => {
      expect(savedWallet(server, 'Checking')?.fees?.[0]?.handled).toBe('2026-10-01')
    })
    expect(await screen.findByText(/Every month · next Nov 1/)).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Add a fee' }))
    const sheet = screen.getByRole('dialog', { name: 'New fee' })
    await user.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Card replacement')
    await user.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '150')
    await user.click(within(sheet).getByRole('button', { name: 'Every year' }))
    await user.type(
      within(sheet).getByRole('textbox', { name: 'Note' }),
      'Free if I report it stolen',
    )
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(savedWallet(server, 'Checking')?.fees?.[1]).toMatchObject({
        name: 'Card replacement',
        amount: 15_000,
        every: 'year',
        start: '2026-10-15',
        note: 'Free if I report it stolen',
      })
    })
    // The note stays in view as a reminder: on the charge due today and in the list.
    expect(await screen.findAllByText('Free if I report it stolen')).toHaveLength(2)
  })

  it('WAL-16: a credit limit shows what is used, what is left and when to pay', async () => {
    const user = userEvent.setup()
    const card = wallet('Nu', { preset: 'creditCard', features: ['creditLimit'] })
    const { server } = start([card, opening(card.id, -438_510)], `/wallets/${card.id}`)

    await user.click(await screen.findByRole('button', { name: 'Set up' }))
    const limit = screen.getByRole('textbox', { name: 'Credit limit' })
    await user.type(limit, '30000')
    // DL-CMP-09: grouped as it is typed.
    expect(limit).toHaveValue('30,000')
    // Days are picked from 1 to 31, never typed.
    await user.click(screen.getByRole('button', { name: /Statement closes on day/ }))
    await user.click(screen.getByRole('button', { name: 'Day 20' }))
    await user.click(screen.getByRole('button', { name: /Payment due on day/ }))
    await user.click(screen.getByRole('button', { name: 'Day 10' }))
    expect(screen.getByRole('button', { name: /Payment due on day/ })).toHaveTextContent('Day 10')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(savedWallet(server, 'Nu')?.credit).toEqual({
        limit: 3_000_000,
        closingDay: 20,
        dueDay: 10,
      })
    })

    expect(await screen.findByText('$4,385.10 of $30,000.00')).toBeVisible()
    expect(screen.getByText('$25,614.90 left to spend')).toBeVisible()
    expect(screen.getByRole('meter', { name: 'Credit used' })).toHaveAttribute(
      'aria-valuenow',
      '15',
    )
    expect(screen.getByText('Oct 20')).toBeVisible()
    expect(screen.getByText('Nov 10')).toBeVisible()
  })

  it('WAL-17: a loan projects its payoff date and the interest still to pay', async () => {
    const user = userEvent.setup()
    const car = wallet('Car loan', { preset: 'loan', features: ['loanSchedule'] })
    const { server } = start([car, opening(car.id, -20_000_000)], `/wallets/${car.id}`)

    await user.click(await screen.findByRole('button', { name: 'Set up' }))
    await user.type(screen.getByRole('textbox', { name: 'Amount borrowed' }), '200000')
    await user.type(screen.getByRole('textbox', { name: 'Rate a year' }), '12')
    await user.type(screen.getByRole('textbox', { name: 'Term' }), '48')
    await user.click(screen.getByRole('button', { name: /Paid on day/ }))
    await user.click(screen.getByRole('button', { name: 'Day 5' }))
    // Left empty, the payment is worked out from the rate.
    expect(screen.getByText(/Leave the payment empty to use \$5,266\.77/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(savedWallet(server, 'Car loan')).toMatchObject({
        loan: { principal: 20_000_000, termMonths: 48, payment: 526_677, paymentDay: 5 },
        interest: { rate: 1200, type: 'nominal', compounding: 'monthly' },
        features: ['loanSchedule', 'interest'],
      })
    })

    expect(await screen.findByText('Paid off in October 2030')).toBeVisible()
    expect(screen.getByText('48 payments of $5,266.77 left')).toBeVisible()
  })

  it('WAL-18: an investment records value changes as gains, apart from money put in', async () => {
    const user = userEvent.setup()
    const fund = wallet('Fund', { preset: 'investment', features: ['valuations'] })
    const { server } = start([fund, opening(fund.id, 1_000_000)], `/wallets/${fund.id}`)

    await user.click(await screen.findByRole('button', { name: 'Update value' }))
    await user.type(screen.getByRole('textbox', { name: 'Value now' }), '10,250')
    expect(screen.getByText('This records a market change of +$250.00.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Record new value' }))

    await waitFor(() => {
      expect(saved(server, 'transaction').map((body) => body.data)).toContainEqual(
        expect.objectContaining({ kind: 'valuation', amount: 25_000 }),
      )
    })
    const card = (await screen.findByRole('heading', { name: 'Investment' })).closest('section')
    if (!card) throw new Error('no card')
    expect(within(card).getByText('$10,000.00')).toBeVisible()
    expect(within(card).getByText('+$250.00')).toBeVisible()
    expect(within(card).getByText('+2.5%')).toBeVisible()
  })

  it('WAL-24: one wallet can be the default for new transactions', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const card = wallet('Nu', { preset: 'creditCard' })
    const preferences: SyncedRecord = {
      id: newRecordId(),
      revision: 1,
      body: { deleted: false, type: 'preferences', schema: 1, data: { defaultCurrency: 'MXN' } },
    }
    const { server } = start([cash, card, preferences], `/wallets/${card.id}`)

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('checkbox', { name: /^Default wallet/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // The other preferences are kept as they were.
    await waitFor(() => {
      expect(saved(server, 'preferences').map((body) => body.data)).toEqual([
        { defaultCurrency: 'MXN', defaultWalletId: card.id },
      ])
    })
    expect(await screen.findByText(/· Default$/)).toBeVisible()
  })

  it('WAL-05: a wallet shows its latest transactions, and the rest on their own screen', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const adjustments = Array.from({ length: 6 }, (_, index) => ({
      id: newRecordId(),
      revision: 1,
      body: transactionBody({
        kind: 'adjustment',
        walletId: cash.id,
        date: `2026-10-0${String(index + 1)}`,
        amount: 1_000,
      }),
    }))
    start([cash, opening(cash.id, 100_000, '2026-09-01'), ...adjustments], `/wallets/${cash.id}`)

    // On a phone, the latest five, right under the balance.
    expect(await screen.findAllByRole('button', { name: /Balance adjustment/ })).toHaveLength(5)
    expect(screen.queryByRole('button', { name: /Opening balance/ })).toBeNull()
    await user.click(screen.getByRole('link', { name: 'See more' }))

    expect(await screen.findByRole('button', { name: /Opening balance/ })).toBeVisible()
    expect(screen.getAllByRole('button', { name: /Balance adjustment/ })).toHaveLength(6)
  })
})
