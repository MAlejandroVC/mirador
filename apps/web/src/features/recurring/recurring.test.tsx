import {
  categoryGroupRecordType,
  categoryRecordType,
  type RecurringRecord,
  type TransactionRecord,
  type WalletRecord,
} from '@repo/api'
import { newRecordId } from '@repo/crypto'
import type { SyncedRecord } from '@repo/sync'
import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../lib/i18n'
import { type FakeServer, renderApp, stubServer, unlockedVault } from '../../test-utils'
import { recordBody, transactionBody, walletBody } from '../wallets/use-ledger'
import { newWalletRecord } from '../wallets/wallet-look'

function wallet(name: string, extra: Partial<WalletRecord> = {}): SyncedRecord {
  return {
    id: newRecordId(),
    revision: 1,
    body: walletBody({ ...newWalletRecord(name, 'MXN'), ...extra }),
  }
}

function record(type: string, data: unknown): SyncedRecord {
  return { id: newRecordId(), revision: 1, body: recordBody(type, data) }
}

// One category group with one expense category.
function categories() {
  const group = record(categoryGroupRecordType, { name: 'Home', color: 'lake' })
  const bills = record(categoryRecordType, {
    groupId: group.id,
    name: 'Bills',
    kind: 'expense',
    icon: 'lightning',
    flexibility: 'fixed',
  })
  return { records: [group, bills], bills }
}

function bodies<T>(server: FakeServer, type: string): (T & { id: string })[] {
  return (server.records ?? []).flatMap((item) =>
    !item.body.deleted && item.body.type === type
      ? [{ id: item.id, ...(item.body.data as T) }]
      : [],
  )
}

configure({ asyncUtilTimeout: 5000 })

describe('recurring transactions and installments', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.spyOn(globalThis.navigator, 'language', 'get').mockReturnValue('es-MX')
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 2, 15, 12) })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('TXN-09: Repeat turns a new transaction into a recurring one, and adds the first', async () => {
    const user = userEvent.setup()
    const checking = wallet('Checking')
    const set = categories()
    const server: FakeServer = { signedIn: 'ana', records: [checking, ...set.records] }
    stubServer(server)
    renderApp('/transactions/recurring', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Add one' }))
    const sheet = await screen.findByRole('dialog', { name: 'New expense' })
    expect(within(sheet).getByRole('button', { name: /Repeat.*Every month/ })).toBeVisible()
    await user.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '1200')
    await user.click(within(sheet).getByRole('button', { name: /^Category/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Category' })).getByRole('radio', {
        name: /Bills/,
      }),
    )
    // TXN-09: ends after a number of times.
    await user.click(within(sheet).getByRole('button', { name: /^Ends/ }))
    const ends = await screen.findByRole('dialog', { name: 'Ends' })
    await user.click(within(ends).getByRole('radio', { name: 'After some times' }))
    const times = within(ends).getByRole('textbox', { name: 'Times' })
    await user.clear(times)
    await user.type(times, '6')
    await user.click(within(ends).getByRole('button', { name: 'Done' }))
    expect(within(sheet).getByRole('button', { name: /Ends.*After 6 times/ })).toBeVisible()
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(bodies<RecurringRecord>(server, 'recurring')).toEqual([
        expect.objectContaining({
          kind: 'expense',
          walletId: checking.id,
          amount: -120_000,
          categoryId: set.bills.id,
          start: '2026-03-15',
          every: { unit: 'month', count: 1 },
          times: 6,
          handled: '2026-03-15',
        }),
      ])
    })
    const [recurring] = bodies<RecurringRecord>(server, 'recurring')
    expect(bodies<TransactionRecord>(server, 'transaction')).toEqual([
      expect.objectContaining({
        amount: -120_000,
        date: '2026-03-15',
        recurringId: recurring?.id,
        occurrence: '2026-03-15',
      }),
    ])
    expect(await screen.findByText('Next Apr 15 · Every month')).toBeVisible()
  })

  it('TXN-10: what came due is added when the app opens, once', async () => {
    const checking = wallet('Checking')
    const set = categories()
    const rent = record('recurring', {
      kind: 'expense',
      walletId: checking.id,
      amount: -1_500_000,
      categoryId: set.bills.id,
      start: '2026-01-31',
      every: { unit: 'month', count: 1 },
      handled: '2026-01-31',
    })
    const server: FakeServer = { signedIn: 'ana', records: [checking, ...set.records, rent] }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    await waitFor(() => {
      expect(
        bodies<TransactionRecord>(server, 'transaction').map((item) => [
          item.date,
          item.occurrence,
          item.source,
        ]),
      ).toEqual([['2026-02-28', '2026-02-28', 'recurring']])
    })
    await waitFor(() => {
      expect(bodies<RecurringRecord>(server, 'recurring')[0]?.handled).toBe('2026-02-28')
    })
    // March 31 is still to come: it waits in Upcoming, with a way to all of them.
    expect(await screen.findByText('Upcoming')).toBeVisible()
    expect(screen.getByText(/Mar 31 · Every month/)).toBeVisible()
    expect(screen.getByRole('link', { name: /Recurring/ })).toHaveAttribute(
      'href',
      '/transactions/recurring',
    )
  })

  it('TXN-10: one that asks first waits to be checked, then is added or skipped', async () => {
    const user = userEvent.setup()
    const checking = wallet('Checking')
    const set = categories()
    const power = record('recurring', {
      kind: 'expense',
      walletId: checking.id,
      amount: -80_000,
      categoryId: set.bills.id,
      note: 'Power',
      start: '2026-03-10',
      every: { unit: 'month', count: 2 },
      ask: true,
    })
    const server: FakeServer = { signedIn: 'ana', records: [checking, ...set.records, power] }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: /Power.*Due Mar 10/ }))
    const sheet = await screen.findByRole('dialog', { name: 'New expense' })
    const amount = within(sheet).getByRole('textbox', { name: 'Amount' })
    expect(amount).toHaveValue('800.00')
    // This bill came in higher.
    await user.clear(amount)
    await user.type(amount, '912.40')
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(bodies<TransactionRecord>(server, 'transaction')).toEqual([
        expect.objectContaining({
          amount: -91_240,
          date: '2026-03-10',
          recurringId: power.id,
          occurrence: '2026-03-10',
        }),
      ])
    })
    await waitFor(() => {
      expect(bodies<RecurringRecord>(server, 'recurring')[0]?.handled).toBe('2026-03-10')
    })
    // Asked first, it was never added by itself.
    expect(bodies<TransactionRecord>(server, 'transaction')).toHaveLength(1)
  })

  it('TXN-30, TXN-31: an expense on a credit card can be paid in installments, with interest', async () => {
    const user = userEvent.setup()
    const card = wallet('Nu', {
      preset: 'creditCard',
      features: ['creditLimit'],
      credit: { limit: 5_000_000, closingDay: 5, dueDay: 25 },
    })
    const set = categories()
    const server: FakeServer = { signedIn: 'ana', records: [card, ...set.records] }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Add a transaction' }))
    const sheet = await screen.findByRole('dialog', { name: 'New expense' })
    await user.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '9000')
    await user.click(within(sheet).getByRole('button', { name: /^Category/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Category' })).getByRole('radio', {
        name: /Bills/,
      }),
    )
    await user.click(within(sheet).getByRole('checkbox', { name: /Pay in installments/ }))
    await user.click(within(sheet).getByRole('radio', { name: '6' }))
    expect(
      within(sheet).getByText(
        '$1,500.00 a month for 6 months, from the Apr 5 statement. All $9,000.00 comes off your available credit at once.',
      ),
    ).toBeVisible()
    // TXN-31: with interest, the bank's monthly payment, never a guessed rate.
    await user.click(within(sheet).getByRole('button', { name: 'With interest' }))
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(
      await within(sheet).findByText('Type the monthly payment you were quoted.'),
    ).toBeVisible()
    await user.type(within(sheet).getByRole('textbox', { name: 'Monthly payment' }), '1750')
    expect(within(sheet).getByText(/\$1,500\.00 of interest, \$10,500\.00 in all/)).toBeVisible()
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(bodies<TransactionRecord>(server, 'transaction')).toEqual([
        expect.objectContaining({
          kind: 'expense',
          amount: -1_050_000,
          installments: { months: 6, price: 900_000 },
        }),
      ])
    })
  })

  it('TXN-30: any wallet can pay in installments, each part leaving it on its day', async () => {
    const user = userEvent.setup()
    const checking = wallet('Checking')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [
        checking,
        ...set.records,
        {
          id: newRecordId(),
          revision: 1,
          body: transactionBody({
            kind: 'openingBalance',
            walletId: checking.id,
            date: '2026-01-01',
            amount: 2_000_000,
          }),
        },
      ],
    }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    await user.click(
      (await screen.findAllByRole('button', { name: /^(New|Add a transaction)$/ }))[0]!,
    )
    const sheet = await screen.findByRole('dialog', { name: 'New expense' })
    await user.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '9000')
    await user.click(within(sheet).getByRole('button', { name: /^Category/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Category' })).getByRole('radio', {
        name: /Bills/,
      }),
    )
    await user.click(within(sheet).getByRole('checkbox', { name: /Pay in installments/ }))
    await user.click(within(sheet).getByRole('radio', { name: '3' }))
    expect(
      within(sheet).getByText(
        '$3,000.00 a month for 3 months, from Mar 15. Each one leaves this wallet on its day.',
      ),
    ).toBeVisible()
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(bodies<TransactionRecord>(server, 'transaction')).toContainEqual(
        expect.objectContaining({ amount: -900_000, installments: { months: 3 } }),
      )
    })

    // Only the first part has left the wallet so far.
    await user.click(screen.getAllByRole('link', { name: 'Wallets' })[0]!)
    expect((await screen.findAllByText('$17,000.00'))[0]).toBeVisible()
    expect(screen.queryByText('$11,000.00')).toBeNull()
  })

  it('TXN-32: Transactions counts a purchase in installments one installment a month', async () => {
    const card = wallet('Nu', {
      preset: 'creditCard',
      features: ['creditLimit'],
      credit: { limit: 5_000_000, closingDay: 5, dueDay: 25 },
    })
    const set = categories()
    const tv = {
      id: newRecordId(),
      revision: 1,
      body: transactionBody({
        kind: 'expense',
        walletId: card.id,
        date: '2026-02-14',
        amount: -900_000,
        note: 'TV',
        categoryId: set.bills.id,
        installments: { months: 6 },
      }),
    }
    const server: FakeServer = { signedIn: 'ana', records: [card, ...set.records, tv] }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    // March holds the second installment, and only it counts.
    const row = await screen.findByRole('button', { name: /TV/ })
    expect(row).toHaveTextContent('2 of 6')
    expect(row).toHaveTextContent('$1,500.00')
    expect(screen.getByText('Expenses').nextElementSibling).toHaveTextContent('$1,500.00')
  })
})
