import {
  type BudgetPlanRecord,
  type CategoryRecord,
  categoryGroupRecordType,
  categoryRecordType,
  type GoalContributionRecord,
  goalContributionRecordType,
  goalRecordType,
  type PreferencesRecord,
  type RecordBody,
  type TransactionRecord,
  type WalletRecord,
} from '@repo/api'
import { newRecordId } from '@repo/crypto'
import type { SyncedRecord } from '@repo/sync'
import { cleanup, configure, screen, waitFor, within } from '@testing-library/react'
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
  const groceries = category(everyday, {
    name: 'Groceries',
    kind: 'expense',
    icon: 'basket',
    flexibility: 'fixed',
  })
  const eatingOut = category(everyday, {
    name: 'Eating out',
    kind: 'expense',
    icon: 'forkKnife',
    flexibility: 'flexible',
  })
  const rent = category(home, { name: 'Rent', kind: 'expense', icon: 'key', flexibility: 'locked' })
  const insurance = category(home, {
    name: 'Insurance',
    kind: 'expense',
    icon: 'umbrella',
    flexibility: 'locked',
  })
  const salary = category(everyday, {
    name: 'Salary',
    kind: 'income',
    icon: 'money',
    flexibility: 'fixed',
  })
  return {
    records: [everyday, home, groceries, eatingOut, rent, insurance, salary],
    groceries,
    eatingOut,
    rent,
    insurance,
    salary,
  }
}

// Six months of the same salary, rent, insurance, groceries and eating out; then March
// so far: the rent is paid, the insurance isn't yet and eating out is already over.
function history(cash: SyncedRecord, set: ReturnType<typeof categories>): SyncedRecord[] {
  const months = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']
  const spend = (date: string, category: SyncedRecord, amount: number) =>
    transaction({
      kind: 'expense',
      walletId: cash.id,
      date,
      amount: -amount,
      categoryId: category.id,
    })
  return [
    ...months.flatMap((month) => [
      transaction({
        kind: 'income',
        walletId: cash.id,
        date: `${month}-01`,
        amount: 400_000,
        categoryId: set.salary.id,
      }),
      spend(`${month}-02`, set.rent, 120_000),
      spend(`${month}-20`, set.insurance, 10_000),
      spend(`${month}-05`, set.groceries, 100_000),
      spend(`${month}-08`, set.eatingOut, 20_000),
    ]),
    transaction({
      kind: 'income',
      walletId: cash.id,
      date: '2026-03-01',
      amount: 400_000,
      categoryId: set.salary.id,
    }),
    spend('2026-03-02', set.rent, 120_000),
    spend('2026-03-05', set.groceries, 30_000),
    spend('2026-03-08', set.eatingOut, 25_000),
  ]
}

const trip = () =>
  record(goalRecordType, {
    name: 'Trip to Oaxaca',
    kind: 'save',
    target: 1_200_000,
    by: '2026-12-31',
    saved: 0,
    walletIds: [],
    start: '2026-01-01',
    order: 0,
  })

/** A list on screen, by its section label. */
function section(label: string) {
  const heading = screen.getByRole('heading', { name: label })
  const list = heading.closest('section')
  if (!list) throw new Error(`No list labeled ${label}`)
  return within(list)
}

/** The row holding a text, such as a category's name. */
function row(text: string) {
  const item = screen.getByText(text).closest('li')
  if (!item) throw new Error(`No row for ${text}`)
  return within(item)
}

function saved<T>(server: FakeServer, type: string) {
  return (server.records ?? [])
    .map((item) => item.body)
    .filter((body): body is Extract<RecordBody, { deleted: false }> => !body.deleted)
    .filter((body) => body.type === type)
    .map((body) => body.data as T)
}

configure({ asyncUtilTimeout: 5000 })

describe('the budget plan', () => {
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

  it('BUD-40, BUD-41, BUD-43: Budget opens on Plan with what is left, and each category by Wants, Needs and Commitments', async () => {
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set)],
    }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    // The usual month plans $2,500 and March has spent $1,750 of it.
    expect(await screen.findByText('Left in March')).toBeVisible()
    expect(screen.getByText(/^of \$2,500\.00 planned/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Plan', pressed: true })).toBeVisible()
    expect(section('Wants').getByText('Eating out')).toBeVisible()
    expect(row('Eating out').getByText('$50.00 over')).toBeVisible()
    expect(section('Needs').getByText('Groceries')).toBeVisible()
    expect(row('Groceries').getByText('$700.00 left')).toBeVisible()
    // Alejandro's call: a Commitment says whether it was paid, not a bar.
    expect(row('Rent').getByText(/^Paid /)).toBeVisible()
    expect(row('Insurance').getByText('Not paid yet')).toBeVisible()
    // BUD-50: February waits for its review.
    expect(screen.getByRole('link', { name: /February has ended/ })).toBeVisible()
  })

  it('BUD-41: a switch shows the categories by category group instead, and stays that way', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set)],
    }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Group' }))
    expect(section('Everyday').getByText('Eating out')).toBeVisible()
    expect(section('Home').getByText('Rent')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Wants' })).toBeNull()

    cleanup()
    renderApp('/budget', unlockedVault(server))
    expect(await screen.findByRole('button', { name: 'Group', pressed: true })).toBeVisible()
  })

  it('BUD-04: a target set by hand stays, and says so', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set)],
    }
    stubServer(server)
    renderApp(`/budget/line/${set.eatingOut.id}`, unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: /^Each month/ }))
    const field = await screen.findByRole('textbox', { name: 'Each month' })
    await user.clear(field)
    await user.type(field, '300')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(saved<BudgetPlanRecord>(server, 'budgetPlan')).toHaveLength(1)
    })
    const [plan] = saved<BudgetPlanRecord>(server, 'budgetPlan')
    expect(plan?.targets).toEqual([{ line: set.eatingOut.id, amount: 30_000, byHand: true }])
    expect(await screen.findByText('Set by you')).toBeVisible()
    expect(screen.getByText('$50.00 left')).toBeVisible()
  })

  it('BUD-06: with no month to learn from, rough amounts make the plan from day one', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = { signedIn: 'ana', records: [cash, ...set.records] }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    expect(await screen.findByText('Your plan starts here')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Import statements' })).toBeVisible()
    await user.click(screen.getByRole('link', { name: 'Enter rough amounts' }))

    await user.type(await screen.findByRole('textbox', { name: 'Income' }), '4000')
    await user.type(screen.getByRole('textbox', { name: 'Rent' }), '1200')
    await user.type(screen.getByRole('textbox', { name: 'Eating out' }), '300')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(saved<BudgetPlanRecord>(server, 'budgetPlan')).toHaveLength(1)
    })
    const [plan] = saved<BudgetPlanRecord>(server, 'budgetPlan')
    expect(plan?.income).toBe(400_000)
    expect(plan?.estimates).toEqual(
      expect.arrayContaining([
        { line: set.rent.id, amount: 120_000 },
        { line: set.eatingOut.id, amount: 30_000 },
      ]),
    )
    // Back on Budget, the plan works from the amounts.
    expect(await screen.findByText('Left in March')).toBeVisible()
    expect(screen.getByText(/^of \$1,500\.00 planned/)).toBeVisible()
  })

  it('BUD-26: money set aside for a goal without a wallet is added on the goal, dated today', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const goal = trip()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set), goal],
    }
    stubServer(server)
    renderApp(`/budget/goal/${goal.id}`, unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Trip to Oaxaca', level: 1 })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Add money' }))
    const dialog = within(await screen.findByRole('dialog'))
    await user.type(dialog.getByRole('textbox', { name: 'Amount' }), '500')
    await user.click(dialog.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(saved<GoalContributionRecord>(server, goalContributionRecordType)).toEqual([
        { goalId: goal.id, amount: 50_000, date: '2026-03-15' },
      ])
    })
    expect(await screen.findByRole('heading', { name: 'Added' })).toBeVisible()
    expect(section('Added').getByText('$500.00')).toBeVisible()
  })

  it('SYS-02, SYS-09: budget settings save at once to the synced preferences', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set)],
    }
    stubServer(server)
    renderApp('/settings/budget', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: '3 months' }))
    await waitFor(() => {
      expect(saved<PreferencesRecord>(server, 'preferences')[0]?.budget).toMatchObject({
        lookback: 3,
        startDay: 1,
      })
    })
    // BUD-03: a whole month left out of the usual month.
    await user.click(screen.getByRole('checkbox', { name: 'January' }))
    await waitFor(() => {
      expect(saved<BudgetPlanRecord>(server, 'budgetPlan')[0]?.exclusions.periods).toEqual([
        '2026-01-01',
      ])
    })
  })
})
