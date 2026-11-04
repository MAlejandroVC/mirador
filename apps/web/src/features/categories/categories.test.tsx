import {
  type CategoryGroupRecord,
  type CategoryRecord,
  categoryGroupRecordType,
  categoryRecordType,
  type RecordBody,
  tagRecordType,
  type TransactionRecord,
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

function record(type: string, data: unknown): SyncedRecord {
  return { id: newRecordId(), revision: 1, body: recordBody(type, data) }
}

function bodies(server: FakeServer, type: string) {
  return (server.records ?? [])
    .map((item) => item.body)
    .filter((body): body is Extract<RecordBody, { deleted: false }> => !body.deleted)
    .filter((body) => body.type === type)
    .map((body) => body.data)
}

configure({ asyncUtilTimeout: 5000 })

describe('categories', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 16, 12) })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('CAT-04, CAT-05: a new account starts with the suggested set, saved whole', async () => {
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/settings/categories', unlockedVault(server))

    // No question first: the set is simply there, ready to change (DL-PRI-04).
    expect(await screen.findByRole('button', { name: /Groceries/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Food & drinks/ })).toBeVisible()
    const categories = bodies(server, categoryRecordType) as CategoryRecord[]
    expect(categories.length).toBeGreaterThan(60)
    expect(categories.filter((item) => item.systemKey !== undefined)).toHaveLength(5)
    expect(bodies(server, categoryGroupRecordType)).toHaveLength(11)
    expect(bodies(server, tagRecordType)).toHaveLength(7)
  })

  it('CAT-26, BUD-10: Needs and wants sorts every expense category and moves one in two taps', async () => {
    const user = userEvent.setup()
    const group = record(categoryGroupRecordType, {
      name: 'Home',
      color: 'lake',
    } satisfies CategoryGroupRecord)
    const category = (name: string, flexibility: CategoryRecord['flexibility']) =>
      record(categoryRecordType, {
        name,
        groupId: group.id,
        kind: 'expense',
        icon: 'basket',
        flexibility,
      } satisfies CategoryRecord)
    const rent = category('Rent', 'locked')
    const groceries = category('Groceries', 'fixed')
    const server: FakeServer = { signedIn: 'ana', records: [group, rent, groceries] }
    stubServer(server)
    renderApp('/settings/categories', unlockedVault(server))

    await user.click(await screen.findByRole('link', { name: 'Needs and wants' }))
    expect(await screen.findByRole('heading', { name: 'Commitments' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Needs' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Wants' })).toBeVisible()
    // Pushed from Categories, so back pops to it (DL-CMP-06).
    expect(screen.getByRole('button', { name: 'Back' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Groceries/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Groceries' })
    expect(within(sheet).getByText('It counts as a need.')).toBeVisible()
    expect(within(sheet).queryByRole('button', { name: 'Move to Needs' })).toBeNull()
    await user.click(within(sheet).getByRole('button', { name: 'Move to Wants' }))

    await waitFor(() => {
      const saved = (bodies(server, categoryRecordType) as CategoryRecord[]).find(
        (item) => item.name === 'Groceries',
      )
      expect(saved?.flexibility).toBe('flexible')
    })
    // Everything else about it stays as it was.
    const saved = (bodies(server, categoryRecordType) as CategoryRecord[]).find(
      (item) => item.name === 'Groceries',
    )
    expect(saved).toMatchObject({ groupId: group.id, kind: 'expense', icon: 'basket' })
  })

  it('CAT-01, CAT-03: a new category needs a name not used in its category group', async () => {
    const user = userEvent.setup()
    const group = record(categoryGroupRecordType, {
      name: 'Food',
      color: 'lake',
    } satisfies CategoryGroupRecord)
    const groceries = record(categoryRecordType, {
      name: 'Groceries',
      groupId: group.id,
      kind: 'expense',
      icon: 'basket',
      flexibility: 'fixed',
    } satisfies CategoryRecord)
    const server: FakeServer = { signedIn: 'ana', records: [group, groceries] }
    stubServer(server)
    renderApp('/settings/categories', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Add category' }))
    const sheet = await screen.findByRole('dialog', { name: 'New category' })
    await user.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'groceries')
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(
      await within(sheet).findByText('Food already has a category with this name.'),
    ).toBeVisible()

    const name = within(sheet).getByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Coffee')
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(bodies(server, categoryRecordType)).toContainEqual(
        expect.objectContaining({ name: 'Coffee', groupId: group.id, kind: 'expense' }),
      )
    })
  })

  it('TXN-08: picking a payee fills in the category used with it last time', async () => {
    const user = userEvent.setup()
    const cash = record('wallet', newWalletRecord('Cash', 'MXN'))
    cash.body = walletBody(newWalletRecord('Cash', 'MXN'))
    const group = record(categoryGroupRecordType, { name: 'Food', color: 'lake' })
    const snacks = record(categoryRecordType, {
      name: 'Snacks',
      groupId: group.id,
      kind: 'expense',
      icon: 'cookie',
      flexibility: 'flexible',
    })
    const oxxo = record('payee', { name: 'Oxxo' })
    const before: SyncedRecord = {
      id: newRecordId(),
      revision: 1,
      body: transactionBody({
        kind: 'expense',
        walletId: cash.id,
        date: '2026-10-10',
        amount: -3500,
        categoryId: snacks.id,
        payeeId: oxxo.id,
      }),
    }
    const server: FakeServer = { signedIn: 'ana', records: [cash, group, snacks, oxxo, before] }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'New transaction' }))
    const sheet = await screen.findByRole('dialog', { name: 'New expense' })
    await user.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '42')
    await user.click(within(sheet).getByRole('button', { name: /^Payee/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Payee' })).getByRole('radio', {
        name: /Oxxo/,
      }),
    )
    expect(within(sheet).getByRole('button', { name: /^Category.*Snacks/ })).toBeVisible()
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(
        (bodies(server, 'transaction') as TransactionRecord[]).filter(
          (item) => item.amount === -4200,
        ),
      ).toEqual([expect.objectContaining({ categoryId: snacks.id, payeeId: oxxo.id })])
    })
  })

  it('TXN-21, TXN-22: the list filters by type and says how many filters are on', async () => {
    const user = userEvent.setup()
    const cash = {
      id: newRecordId(),
      revision: 1,
      body: walletBody(newWalletRecord('Cash', 'MXN')),
    }
    const entry = (data: Omit<TransactionRecord, 'walletId' | 'date'>): SyncedRecord => ({
      id: newRecordId(),
      revision: 1,
      body: transactionBody({ walletId: cash.id, date: '2026-10-05', ...data }),
    })
    const server: FakeServer = {
      signedIn: 'ana',
      records: [
        cash,
        entry({ kind: 'expense', amount: -2000, note: 'Tacos' }),
        entry({ kind: 'income', amount: 50_000, note: 'Pay' }),
      ],
    }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    expect(await screen.findByText('Tacos')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Filter' }))
    const sheet = await screen.findByRole('dialog', { name: 'Filter' })
    await user.click(within(sheet).getByRole('checkbox', { name: 'Income' }))
    await user.click(within(sheet).getByRole('button', { name: 'Done' }))

    await waitFor(() => {
      expect(screen.queryByText('Tacos')).toBeNull()
    })
    expect(screen.getByText('Pay')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Filter, 1 on' })).toBeVisible()
  })
})
