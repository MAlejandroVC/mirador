import { type RecordBody, type TransactionRecord, type WalletRecord } from '@repo/api'
import { openingBalance } from '@repo/core'
import { newRecordId } from '@repo/crypto'
import type { SyncedRecord } from '@repo/sync'
import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../lib/i18n'
import { type FakeServer, renderApp, stubServer, unlockedVault } from '../../test-utils'
import { exchangeRateBody, transactionBody, walletBody } from '../wallets/use-ledger'
import { newWalletRecord } from '../wallets/wallet-look'

function wallet(name: string, extra: Partial<WalletRecord> = {}): SyncedRecord {
  return {
    id: newRecordId(),
    revision: 1,
    body: walletBody({ ...newWalletRecord(name, 'MXN'), ...extra }),
  }
}

function transaction(data: TransactionRecord): SyncedRecord {
  return { id: newRecordId(), revision: 1, body: transactionBody(data) }
}

function opening(walletId: string, amount: number, date = '2026-10-01'): SyncedRecord {
  return transaction(openingBalance(walletId, amount, date))
}

function preferences(defaultWalletId: string): SyncedRecord {
  return {
    id: newRecordId(),
    revision: 1,
    body: {
      deleted: false,
      type: 'preferences',
      schema: 1,
      data: { defaultCurrency: 'MXN', defaultWalletId },
    },
  }
}

function saved(server: FakeServer) {
  return (server.records ?? [])
    .map((record) => record.body)
    .filter((body): body is Extract<RecordBody, { deleted: false }> => !body.deleted)
    .filter((body) => body.type === 'transaction')
    .map((body) => body.data as TransactionRecord)
}

const today = () => {
  const now = new Date()
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// The first test pays for loading the screens and decrypting records.
configure({ asyncUtilTimeout: 5000 })

describe('transactions', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.spyOn(globalThis.navigator, 'language', 'get').mockReturnValue('es-MX')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('DL-CMP-14: with no transactions, the empty state offers to add one', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const server: FakeServer = { signedIn: 'ana', records: [cash] }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'A blank page, for now' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Add a transaction' }))
    expect(await screen.findByRole('heading', { name: 'New expense' })).toBeVisible()
  })

  it('TXN-20, TXN-28, DL-NUM-03: grouped by day with what was spent; income has a plus', async () => {
    const cash = wallet('Cash')
    const server: FakeServer = {
      signedIn: 'ana',
      records: [
        cash,
        transaction({ kind: 'expense', walletId: cash.id, date: '2026-03-02', amount: -4550 }),
        transaction({
          kind: 'expense',
          walletId: cash.id,
          date: '2026-03-02',
          amount: -1000,
          note: 'Coffee',
        }),
        transaction({
          kind: 'income',
          walletId: cash.id,
          date: '2026-03-01',
          amount: 120_000,
          note: 'Salary',
        }),
      ],
    }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Mar 2' })).toBeVisible()
    expect(screen.getByText('$55.50 spent')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Mar 1' })).toBeVisible()
    // A note names the row; what it was moves to the second line.
    expect(screen.getByText('Coffee')).toBeVisible()
    expect(screen.getByText('Expense · Cash')).toBeVisible()
    expect(screen.getByText('+$1,200.00')).toBeInTheDocument()
    expect(screen.getByText('$45.50')).toBeInTheDocument()
  })

  it('WID-03, TXN-01: quick-add needs only the amount; it starts in the default wallet', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const debit = wallet('Debit')
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, debit, preferences(debit.id), opening(debit.id, 100_000)],
    }
    stubServer(server)
    renderApp('/wallets', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'New transaction' }))
    const sheet = await screen.findByRole('dialog', { name: 'New expense' })
    expect(within(sheet).getByRole('button', { name: /Wallet.*Debit/ })).toBeVisible()
    await user.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '250')
    await user.type(within(sheet).getByRole('textbox', { name: 'Note' }), 'Groceries')
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(saved(server).filter((data) => data.kind === 'expense')).toEqual([
        expect.objectContaining({
          walletId: debit.id,
          amount: -25_000,
          date: today(),
          note: 'Groceries',
          source: 'quickAdd',
        }),
      ])
    })
    // WAL-06: the wallet's balance is what it had, less the expense.
    await waitFor(() => {
      expect(screen.getAllByText('$750.00').length).toBeGreaterThan(0)
    })
  })

  it('TXN-02: Save points at the missing amount and saves nothing', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const server: FakeServer = { signedIn: 'ana', records: [cash] }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Add a transaction' }))
    const sheet = await screen.findByRole('dialog', { name: 'New expense' })
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    expect(await within(sheet).findByText('Type an amount above zero, like 45.50.')).toBeVisible()
    expect(within(sheet).getByRole('textbox', { name: 'Amount' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(saved(server)).toEqual([])
  })

  it('TXN-03, TXN-04, WAL-04: paying a card lowers what is owed; inactive wallets are not offered', async () => {
    const user = userEvent.setup()
    const debit = wallet('Debit')
    const card = wallet('Card', { preset: 'creditCard' })
    const old = wallet('Old card', { active: false })
    const server: FakeServer = {
      signedIn: 'ana',
      records: [debit, card, old, opening(debit.id, 100_000), opening(card.id, -30_000)],
    }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'New transaction' }))
    const sheet = await screen.findByRole('dialog', { name: 'New expense' })
    await user.click(within(sheet).getByRole('button', { name: 'Transfer' }))
    expect(await screen.findByRole('dialog', { name: 'New transfer' })).toBe(sheet)
    await user.click(within(sheet).getByRole('button', { name: /^From/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'From' })).getByRole('radio', {
        name: /Debit/,
      }),
    )
    await user.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '200')
    await user.click(within(sheet).getByRole('button', { name: /^To/ }))
    const picker = await screen.findByRole('dialog', { name: 'To' })
    expect(within(picker).queryByRole('radio', { name: /Old card/ })).toBeNull()
    expect(within(picker).queryByRole('radio', { name: /Debit/ })).toBeNull()
    await user.click(within(picker).getByRole('radio', { name: /Card/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(saved(server).filter((data) => data.kind === 'transfer')).toEqual([
        expect.objectContaining({
          walletId: debit.id,
          amount: -20_000,
          toWalletId: card.id,
          toAmount: 20_000,
        }),
      ])
    })
    // A transfer is not spending, so the day shows no total; the row says where it went.
    expect(await screen.findByText('To Card')).toBeVisible()
    expect(screen.queryByText(/spent$/)).toBeNull()
  })

  it('TXN-05: between currencies, the rate in use fills in what arrives', async () => {
    const user = userEvent.setup()
    const debit = wallet('Debit')
    const dollars = wallet('Dollars', { currency: 'USD' })
    const rate: SyncedRecord = {
      id: newRecordId(),
      revision: 1,
      body: exchangeRateBody({ from: 'USD', to: 'MXN', rate: 20_000_000, date: '2026-01-01' }),
    }
    const server: FakeServer = { signedIn: 'ana', records: [debit, dollars, rate] }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'New transaction' }))
    const sheet = await screen.findByRole('dialog', { name: 'New expense' })
    await user.click(within(sheet).getByRole('button', { name: 'Transfer' }))
    await user.click(within(sheet).getByRole('button', { name: /^From/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'From' })).getByRole('radio', {
        name: /Debit/,
      }),
    )
    await user.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '1000')
    await user.click(within(sheet).getByRole('button', { name: /^To/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'To' })).getByRole('radio', {
        name: /Dollars/,
      }),
    )
    // 1 MXN buys 0.05 USD, the inverse of the 20.00 entered for USD.
    expect(within(sheet).getByRole('textbox', { name: 'Amount received' })).toHaveValue('50.00')
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(saved(server)).toEqual([
        expect.objectContaining({
          kind: 'transfer',
          amount: -100_000,
          toAmount: 5_000,
          rate: 50_000,
        }),
      ])
    })
  })

  it('TXN-01, TXN-13: an expense opens to be changed, and deleting it can be undone', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const lunch = transaction({
      kind: 'expense',
      walletId: cash.id,
      date: '2026-03-02',
      amount: -12_000,
      note: 'Lunch',
    })
    const server: FakeServer = { signedIn: 'ana', records: [cash, lunch] }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: /Lunch/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit expense' })
    const amount = within(sheet).getByRole('textbox', { name: 'Amount' })
    await user.clear(amount)
    await user.type(amount, '150')
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(saved(server)).toEqual([expect.objectContaining({ amount: -15_000, note: 'Lunch' })])
    })

    await user.click(await screen.findByRole('button', { name: /Lunch/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Edit expense' })).getByRole('button', {
        name: 'Delete transaction',
      }),
    )
    await waitFor(() => {
      expect(saved(server)).toEqual([])
    })
    expect(await screen.findByText('Transaction deleted')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => {
      expect(saved(server)).toEqual([expect.objectContaining({ amount: -15_000 })])
    })
  })

  it('WID-03: with no wallet yet, quick-add asks for one first', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'New transaction' }))
    expect(await screen.findByRole('heading', { name: 'First, a wallet' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add a wallet' })).toBeVisible()
  })
})
