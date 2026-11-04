import {
  type CategoryRecord,
  categoryGroupRecordType,
  categoryRecordType,
  type MonthBudgetRecord,
  monthBudgetRecordType,
  type PreferencesRecord,
  preferencesRecordType,
  type RecordBody,
  recurringRecordType,
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

// Home on March 15, 2026, after six months of the same salary, rent, insurance and
// groceries, with eating out already over its target this month.

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

function record(type: string, data: unknown): SyncedRecord {
  return { id: newRecordId(), revision: 1, body: recordBody(type, data) }
}

function categories() {
  const everyday = record(categoryGroupRecordType, { name: 'Everyday', color: 'lake' })
  const home = record(categoryGroupRecordType, { name: 'Home', color: 'clay' })
  const category = (group: SyncedRecord, data: Omit<CategoryRecord, 'groupId'>) =>
    record(categoryRecordType, { groupId: group.id, ...data })
  const set = {
    groceries: category(everyday, {
      name: 'Groceries',
      kind: 'expense',
      icon: 'basket',
      flexibility: 'fixed',
    }),
    eatingOut: category(everyday, {
      name: 'Eating out',
      kind: 'expense',
      icon: 'forkKnife',
      flexibility: 'flexible',
    }),
    rent: category(home, { name: 'Rent', kind: 'expense', icon: 'key', flexibility: 'locked' }),
    salary: category(everyday, {
      name: 'Salary',
      kind: 'income',
      icon: 'money',
      flexibility: 'fixed',
    }),
  }
  return { ...set, records: [everyday, home, ...Object.values(set)] }
}

function history(cash: SyncedRecord, set: ReturnType<typeof categories>): SyncedRecord[] {
  const spend = (date: string, category: SyncedRecord, amount: number) =>
    transaction({
      kind: 'expense',
      walletId: cash.id,
      date,
      amount: -amount,
      categoryId: category.id,
    })
  const earn = (date: string) =>
    transaction({
      kind: 'income',
      walletId: cash.id,
      date,
      amount: 400_000,
      categoryId: set.salary.id,
    })
  const months = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']
  return [
    ...months.flatMap((month) => [
      earn(`${month}-01`),
      spend(`${month}-02`, set.rent, 120_000),
      spend(`${month}-05`, set.groceries, 100_000),
      spend(`${month}-08`, set.eatingOut, 20_000),
    ]),
    earn('2026-03-01'),
    spend('2026-03-02', set.rent, 120_000),
    spend('2026-03-05', set.groceries, 30_000),
    spend('2026-03-08', set.eatingOut, 25_000),
  ]
}

/** BUD-71: March's budget, locked in at the usual month: $2,400 in all. */
function lockedMarch(set: ReturnType<typeof categories>): SyncedRecord {
  const data: MonthBudgetRecord = {
    start: '2026-03-01',
    targets: [
      { line: set.rent.id, amount: 120_000 },
      { line: set.groceries.id, amount: 100_000 },
      { line: set.eatingOut.id, amount: 20_000 },
    ].sort((a, b) => a.line.localeCompare(b.line)),
    income: 400_000,
    lockedAt: '2026-03-01T09:00:00.000Z',
  }
  return record(monthBudgetRecordType, data)
}

function saved<T>(server: FakeServer, type: string) {
  return (server.records ?? [])
    .map((item) => item.body)
    .filter((body): body is Extract<RecordBody, { deleted: false }> => !body.deleted)
    .filter((body) => body.type === type)
    .map((body) => body.data as T)
}

/** A list on screen, by its section label. */
function section(label: string) {
  const heading = screen.getByRole('heading', { name: label })
  const list = heading.closest('section')
  if (!list) throw new Error(`No section labeled ${label}`)
  return within(list)
}

configure({ asyncUtilTimeout: 5000 })

describe('Home', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.spyOn(globalThis.navigator, 'language', 'get').mockReturnValue('es-MX')
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 2, 15, 12) })
  })

  afterEach(() => {
    globalThis.localStorage.clear()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('DSH-09: someone new sees the steps to get started, and that nothing needs them', async () => {
    const server: FakeServer = { signedIn: 'ana', records: [] }
    stubServer(server)
    renderApp('/', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Get started' })).toBeVisible()
    expect(screen.getByText('0 of 5 done')).toBeVisible()
    expect(screen.getByRole('link', { name: /Add your wallets/ })).toHaveAttribute(
      'href',
      '/wallets',
    )
    expect(screen.getByText('Sunday, March 15')).toBeVisible()
    // DSH-01: a month without a budget says what was spent.
    expect(screen.getByText('Spent in March')).toBeVisible()
    expect(section('Needs attention').getByText("You're all caught up")).toBeVisible()
  })

  it('DSH-01, DSH-02, DSH-05, DSH-08, BUD-45: a month with a budget shows what is left and what is over', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set), lockedMarch(set)],
    }
    stubServer(server)
    const { router } = renderApp('/', unlockedVault(server))

    // $2,400 budgeted, $1,750 spent: $650 left over the 17 days to go.
    expect(await screen.findByText('Left in March')).toBeVisible()
    expect(screen.getByText('17 days left · about $38.23 a day')).toBeVisible()
    expect(screen.getByText(/^\$1,750\.00 of \$2,400\.00 budgeted\./)).toBeVisible()
    // Getting started is done once there are wallets, history, a budget and a goal; the
    // goal is still missing here.
    expect(screen.getByText('3 of 5 done')).toBeVisible()

    const attention = section('Needs attention')
    const over = attention.getByRole('link', { name: /Eating out is over/ })
    expect(within(over).getByText('$50.00 over')).toBeVisible()
    // DL-PAT-05: overspending takes `warning`, in words only.
    expect(within(over).getByText('$50.00 over')).toHaveClass('text-warning')
    // Rent is a Commitment: it lands on its date, so it is never "over".
    expect(attention.queryByText(/Rent is/)).toBeNull()

    await user.click(over)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/budget/line/${set.eatingOut.id}`)
    })
  })

  it('DSH-05, DSH-11: what waits to be confirmed needs attention; what happens on its own is coming up', async () => {
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [
        cash,
        ...set.records,
        ...history(cash, set),
        lockedMarch(set),
        record(recurringRecordType, {
          kind: 'expense',
          walletId: cash.id,
          amount: -15_000,
          categoryId: set.groceries.id,
          start: '2026-03-20',
          every: { unit: 'month', count: 1 },
          createdAt: '2026-03-01T09:00:00.000Z',
        }),
        record(recurringRecordType, {
          kind: 'income',
          walletId: cash.id,
          amount: 50_000,
          categoryId: set.salary.id,
          start: '2026-03-25',
          every: { unit: 'month', count: 1 },
          createdAt: '2026-03-01T09:00:00.000Z',
        }),
        record(recurringRecordType, {
          kind: 'expense',
          walletId: cash.id,
          amount: -9_900,
          categoryId: set.eatingOut.id,
          start: '2026-03-10',
          every: { unit: 'month', count: 1 },
          ask: true,
          createdAt: '2026-03-01T09:00:00.000Z',
        }),
      ],
    }
    stubServer(server)
    renderApp('/', unlockedVault(server))

    // TXN-10: the one that asks first came due on the 10th.
    const confirm = await screen.findByRole('link', { name: /Confirm Eating out/ })
    expect(within(confirm).getByText('Due Mar 10')).toBeVisible()
    expect(confirm).toHaveAttribute('href', '/transactions')

    const coming = section('Coming up')
    expect(coming.getByText('Groceries')).toBeVisible()
    expect(coming.getByText('Friday · Cash')).toBeVisible()
    const salary = coming.getByText('Salary').closest('li')
    if (!salary) throw new Error('No salary row')
    expect(within(salary).getByText('+$500.00')).toBeInTheDocument()
    expect(
      coming.getByText((_, element) =>
        element?.tagName === 'P'
          ? element.textContent === 'In the next two weeks, $150.00 goes out and +$500.00 comes in.'
          : false,
      ),
    ).toBeVisible()
    expect(coming.getByRole('link', { name: 'See everything coming up' })).toHaveAttribute(
      'href',
      '/budget/coming',
    )
  })

  it('DSH-10, SEC-01: Edit Home hides a card, saved with the preferences through the vault only', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set)],
    }
    stubServer(server)
    const fetches = vi.mocked(globalThis.fetch)
    renderApp('/', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Coming up' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Edit Home' }))
    const show = screen.getByRole('switch', { name: 'Show Coming up' })
    expect(show).toHaveAttribute('aria-checked', 'true')
    await user.click(show)
    expect(show).toHaveAttribute('aria-checked', 'false')
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() => {
      expect(saved<PreferencesRecord>(server, preferencesRecordType).at(-1)?.home).toEqual({
        order: ['attention', 'coming', 'goals', 'netWorth', 'highlights', 'latest'],
        hidden: ['coming'],
      })
    })
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Coming up' })).toBeNull()
    })
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeVisible()
    // The preferences go to the vault, which encrypts them before they sync; the page
    // sends nothing about them, and only to its own server (NFR-05).
    for (const [input, init] of fetches.mock.calls) {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input
      expect(url).toMatch(/^\/api\//)
      const body = typeof init?.body === 'string' ? init.body : ''
      expect(body).not.toMatch(/netWorth|highlights|preferences/)
    }
  })

  it('DSH-05, WAL-07: a balance not checked in a month asks for a look, and checking it marks the day', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const server: FakeServer = {
      signedIn: 'ana',
      records: [
        cash,
        transaction({
          kind: 'openingBalance',
          walletId: cash.id,
          date: '2026-01-10',
          amount: 10_000,
        }),
      ],
    }
    stubServer(server)
    renderApp('/', unlockedVault(server))

    const check = await screen.findByRole('link', { name: /Check Cash's balance/ })
    expect(within(check).getByText('Last checked Jan 10')).toBeVisible()
    await user.click(check)

    // It already matches: no adjustment, but the wallet remembers the day.
    await user.click(await screen.findByRole('button', { name: 'Update balance' }))
    await user.type(screen.getByRole('textbox', { name: 'Balance now' }), '100')
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }))
    await waitFor(() => {
      expect(saved<WalletRecord>(server, 'wallet').at(-1)?.checkedOn).toBe('2026-03-15')
    })
    expect(saved(server, 'transaction')).toHaveLength(1)
  })

  it('DSH-09: looking at Needs and wants finishes the step to review categories', async () => {
    const set = categories()
    const server: FakeServer = { signedIn: 'ana', records: [...set.records] }
    stubServer(server)
    renderApp('/settings/needs-and-wants', unlockedVault(server))

    await waitFor(() => {
      expect(
        saved<PreferencesRecord>(server, preferencesRecordType).at(-1)?.categoriesReviewedOn,
      ).toBe('2026-03-15')
    })
  })
})
