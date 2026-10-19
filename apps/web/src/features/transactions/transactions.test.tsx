import {
  type CategoryRecord,
  categoryGroupRecordType,
  categoryRecordType,
  type RecordBody,
  type TransactionRecord,
  type WalletRecord,
} from '@repo/api'
import { openingBalance } from '@repo/core'
import { newRecordId } from '@repo/crypto'
import type { SyncedRecord } from '@repo/sync'
import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../lib/i18n'
import { type FakeServer, renderApp, stubServer, unlockedVault } from '../../test-utils'
import { exchangeRateBody, recordBody, transactionBody, walletBody } from '../wallets/use-ledger'
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

// A small set of categories: one category group with an expense and an income category,
// and the system category for transactions without one (CAT-05).
function categories() {
  const group: SyncedRecord = {
    id: newRecordId(),
    revision: 1,
    body: recordBody(categoryGroupRecordType, { name: 'Everyday', color: 'lake' }),
  }
  const category = (data: Omit<CategoryRecord, 'groupId'>): SyncedRecord => ({
    id: newRecordId(),
    revision: 1,
    body: recordBody(categoryRecordType, { groupId: group.id, ...data }),
  })
  const groceries = category({
    name: 'Groceries',
    kind: 'expense',
    icon: 'basket',
    flexibility: 'fixed',
  })
  const salary = category({ name: 'Salary', kind: 'income', icon: 'money', flexibility: 'fixed' })
  const uncategorized = category({
    name: 'Uncategorized',
    kind: 'any',
    icon: 'questionMark',
    flexibility: 'flexible',
    systemKey: 'uncategorized',
  })
  return { records: [group, groceries, salary, uncategorized], groceries, salary }
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
    // TXN-22: the list shows the current month, so "today" is fixed in March 2026.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 2, 15, 12) })
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it("TXN-20, TXN-24, TXN-28, DL-NUM-03: grouped by day with each day's net; income has a plus", async () => {
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [
        cash,
        ...set.records,
        transaction({
          kind: 'expense',
          walletId: cash.id,
          date: '2026-03-02',
          amount: -4550,
          categoryId: set.groceries.id,
        }),
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
          categoryId: set.salary.id,
        }),
        // TXN-22: February is outside the month shown.
        transaction({
          kind: 'expense',
          walletId: cash.id,
          date: '2026-02-27',
          amount: -9900,
          note: 'Last month',
        }),
      ],
    }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Mar 2' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Mar 1' })).toBeVisible()
    expect(screen.getByText('3 transactions')).toBeVisible()
    expect(screen.queryByText('Last month')).toBeNull()
    // A note names the row; its category moves to the second line. No type label.
    expect(screen.getByText('Coffee')).toBeVisible()
    expect(screen.getByText('Uncategorized · Cash')).toBeVisible()
    expect(screen.getByText('Groceries')).toBeVisible()
    expect(screen.queryByText(/^Expense( ·|$)/)).toBeNull()
    expect(screen.getAllByText('+$1,200.00').length).toBeGreaterThan(0)
    expect(screen.getByText('$45.50')).toBeInTheDocument()
    // The day's net reads like an expense; the month's totals add everything up.
    expect(screen.getAllByText('$55.50')).toHaveLength(2)
    expect(screen.getByText('+$1,144.50')).toBeInTheDocument()

    // The previous month brings February in.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Previous period' }))
    expect(await screen.findByText('Last month')).toBeVisible()
  })

  it('WID-03, TXN-01: quick-add needs only the amount; it starts in the default wallet', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const debit = wallet('Debit')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, debit, preferences(debit.id), opening(debit.id, 100_000), ...set.records],
    }
    stubServer(server)
    renderApp('/wallets', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'New transaction' }))
    const sheet = await screen.findByRole('dialog', { name: 'New expense' })
    expect(within(sheet).getByRole('button', { name: /Wallet.*Debit/ })).toBeVisible()
    await user.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '250')
    await user.type(within(sheet).getByRole('textbox', { name: 'Note' }), 'Weekly shop')
    // WID-03: the category is the one other thing it asks for.
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(await within(sheet).findByText('Pick a category.')).toBeVisible()
    await user.click(within(sheet).getByRole('button', { name: /^Category/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Category' })).getByRole('radio', {
        name: /Groceries/,
      }),
    )
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(saved(server).filter((data) => data.kind === 'expense')).toEqual([
        expect.objectContaining({
          walletId: debit.id,
          amount: -25_000,
          date: today(),
          note: 'Weekly shop',
          categoryId: set.groceries.id,
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
    // A transfer is not spending: it reads "from → to", its amount muted.
    expect(await screen.findByText('Debit → Card')).toBeVisible()
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

  it('IMP-35: an imported transaction stays part of its import after it is changed', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const { records, groceries } = categories()
    const batchId = newRecordId()
    const imported = transaction({
      kind: 'expense',
      walletId: cash.id,
      date: '2026-03-03',
      amount: -8_000,
      note: 'Market',
      categoryId: groceries.id,
      source: 'import',
      importBatchId: batchId,
    })
    const server: FakeServer = { signedIn: 'ana', records: [cash, ...records, imported] }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: /Market/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit expense' })
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(saved(server)).toEqual([
        expect.objectContaining({ note: 'Market', source: 'import', importBatchId: batchId }),
      ])
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
