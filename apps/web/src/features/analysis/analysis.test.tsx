import {
  type CategoryRecord,
  categoryGroupRecordType,
  categoryRecordType,
  type RecordBody,
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
import { resetAnalysisState } from './analysis-state'

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
  const eatingOut = category({
    name: 'Eating out',
    kind: 'expense',
    icon: 'forkKnife',
    flexibility: 'flexible',
  })
  const salary = category({ name: 'Salary', kind: 'income', icon: 'money', flexibility: 'fixed' })
  const uncategorized = category({
    name: 'Uncategorized',
    kind: 'any',
    icon: 'questionMark',
    flexibility: 'flexible',
    systemKey: 'uncategorized',
  })
  return {
    records: [group, groceries, eatingOut, salary, uncategorized],
    group,
    groceries,
    eatingOut,
    salary,
  }
}

function saved(server: FakeServer) {
  return (server.records ?? [])
    .map((record) => record.body)
    .filter((body): body is Extract<RecordBody, { deleted: false }> => !body.deleted)
    .filter((body) => body.type === 'transaction')
    .map((body) => body.data as TransactionRecord)
}

// Six complete months of the same groceries and a little eating out, then March so far.
function history(cash: SyncedRecord, set: ReturnType<typeof categories>): SyncedRecord[] {
  const months = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']
  return [
    ...months.flatMap((month, index) => [
      transaction({
        kind: 'income',
        walletId: cash.id,
        date: `${month}-01`,
        amount: 400_000,
        categoryId: set.salary.id,
      }),
      transaction({
        kind: 'expense',
        walletId: cash.id,
        date: `${month}-05`,
        amount: -100_000,
        categoryId: set.groceries.id,
      }),
      transaction({
        kind: 'expense',
        walletId: cash.id,
        date: `${month}-08`,
        amount: -(20_000 + index * 2000),
        categoryId: set.eatingOut.id,
      }),
    ]),
    transaction({
      kind: 'income',
      walletId: cash.id,
      date: '2026-03-01',
      amount: 400_000,
      categoryId: set.salary.id,
    }),
    transaction({
      kind: 'expense',
      walletId: cash.id,
      date: '2026-03-05',
      amount: -150_000,
      categoryId: set.groceries.id,
    }),
  ]
}

configure({ asyncUtilTimeout: 5000 })

describe('spending analysis', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.spyOn(globalThis.navigator, 'language', 'get').mockReturnValue('es-MX')
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 2, 15, 12) })
    resetAnalysisState()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('ANA-01, ANA-12, BUD-01: the period so far against the usual one, with income, left over and saved', async () => {
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set)],
    }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    expect(await screen.findByText('Spent so far')).toBeVisible()
    // By March 15 a usual month had spent groceries ($1,000) and eating out ($200 to
    // $300, median $250), so $1,500 is $250 more than usual.
    expect(screen.getByText('$250.00 more than usual by Mar 15')).toBeVisible()
    expect(screen.getByText('63%')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Spending', pressed: true })).toBeVisible()
    // The bigger questions are tiles that open their own screens.
    expect(screen.getByRole('link', { name: /What can I cut\?/ })).toBeVisible()
    expect(screen.getByRole('link', { name: /When do I spend\?/ })).toBeVisible()
  })

  it('ANA-26, ANA-30: the wide tile says what changed most and opens every change', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set)],
    }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    // Four questions and the wide one, each opening a different screen.
    const tile = await screen.findByRole('link', { name: /What changed\?/ })
    expect(within(tile).getByText('Groceries')).toBeVisible()
    // One purchase, as usual, at $1,500 instead of $1,000: the price went up.
    const sentence = '$500.00 above usual: about as many purchases, each costing more.'
    expect(within(tile).getByText(sentence)).toBeVisible()
    for (const question of [
      /When do I spend\?/,
      /What's coming\?/,
      /What can I cut\?/,
      /Where is this going\?/,
    ])
      expect(screen.getByRole('link', { name: question })).toBeVisible()
    expect(screen.queryByRole('link', { name: /What repeats\?/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Who do I pay most\?/ })).toBeNull()

    await user.click(tile)
    expect(await screen.findByRole('heading', { name: 'What changed?', level: 1 })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Above usual' })).toBeVisible()
    const row = screen.getByRole('link', { name: /Groceries/ })
    expect(within(row).getByText(sentence)).toBeVisible()
  })

  it('ANA-13, CAT-26: the card splits commitments, needs and wants and opens where to change them', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set)],
    }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    expect(await screen.findByText('Commitments, needs and wants')).toBeVisible()
    await user.click(screen.getByRole('link', { name: 'Choose what’s a need or a want' }))
    expect(await screen.findByRole('heading', { name: 'Needs and wants', level: 1 })).toBeVisible()
    expect(screen.getByRole('button', { name: /Eating out/ })).toBeVisible()
    // Income categories are not spending, so they have no place here.
    expect(screen.queryByRole('button', { name: /Salary/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Spent so far')).toBeVisible()
  })

  it('ANA-10, ANA-04: a category group opens its own screen, and its transactions open filtered', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set)],
    }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    await user.click(await screen.findByRole('link', { name: /Everyday/ }))
    expect(await screen.findByRole('heading', { name: 'Everyday', level: 1 })).toBeVisible()
    // ANA-10: down from the group to its categories.
    expect(screen.getByRole('link', { name: /Groceries/ })).toBeVisible()
    await user.click(screen.getByRole('link', { name: 'See transactions' }))
    expect(await screen.findByRole('button', { name: 'Filter, 1 on' })).toBeVisible()
    expect(screen.getByText('2 transactions')).toBeVisible()
    // DL-CMP-06: Transactions was pushed from the group, so back pops to it, then Budget.
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Everyday', level: 1 })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Spent so far')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('ANA-31, ANA-32: wants ranked by what a step saves, never below a month already lived', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set)],
    }
    stubServer(server)
    renderApp('/budget/cut', unlockedVault(server))

    // Eating out: usually $250 (median of $200 to $300), lowest $200: a step is 15% of
    // $250, $37.50. Groceries are a need, so they are never ranked.
    const row = await screen.findByRole('link', { name: /Eating out/ })
    expect(within(row).getByText('$37.50')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Groceries/ })).toBeNull()
    await user.click(row)
    expect(await screen.findByText('5% less')).toBeVisible()
  })

  it('TXN-11: money in can be a refund for an expense category, and counts as less spending', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set)],
    }
    stubServer(server)
    renderApp('/transactions', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'New transaction' }))
    const sheet = await screen.findByRole('dialog', { name: 'New expense' })
    await user.click(within(sheet).getByRole('button', { name: 'Income' }))
    await user.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '500')
    await user.click(within(sheet).getByRole('button', { name: /^Category/ }))
    const picker = await screen.findByRole('dialog', { name: 'Category' })
    // Income categories first; a refund takes the category of what was refunded.
    expect(within(picker).queryByRole('radio', { name: /Groceries/ })).toBeNull()
    await user.click(
      within(picker).getByRole('button', { name: 'A refund for something you bought' }),
    )
    await user.click(within(picker).getByRole('radio', { name: /Groceries/ }))
    expect(within(sheet).getByRole('button', { name: /Refund for Groceries/ })).toBeVisible()
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(saved(server)).toContainEqual(
        expect.objectContaining({ kind: 'income', amount: 50_000, categoryId: set.groceries.id }),
      )
    })
    // The month's totals: income stays $4,000; spending drops by the refund.
    expect(await screen.findByText('$1,000.00')).toBeInTheDocument()
    expect(screen.getAllByText('+$4,000.00').length).toBeGreaterThan(0)
  })

  it('SEC-01: looking through the analysis saves and sends nothing', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const records = [cash, ...set.records, ...history(cash, set)]
    const server: FakeServer = { signedIn: 'ana', records: [...records] }
    stubServer(server)
    const fetches = vi.mocked(globalThis.fetch)
    renderApp('/budget', unlockedVault(server))

    await user.click(await screen.findByRole('link', { name: /When do I spend\?/ }))
    expect(await screen.findByRole('heading', { name: 'When do I spend?', level: 1 })).toBeVisible()
    // Only the app's own server is ever called (NFR-05), and nothing new is stored.
    for (const [input] of fetches.mock.calls) {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input
      expect(url).toMatch(/^\/api\//)
    }
    expect(server.records).toHaveLength(records.length)
  })
})
