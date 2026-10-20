import {
  budgetPlanRecordType,
  type CategoryRecord,
  categoryGroupRecordType,
  categoryRecordType,
  type GoalRecord,
  goalRecordType,
  type RecordBody,
  type ScenarioRecord,
  scenarioRecordType,
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

// Epic 6, what-ifs. Six months of the same salary, groceries, rent and a little eating
// out make a usual month of $4,000 in and $2,750 out, so $1,250 is left over, and one
// goal asks for $1,500 a month: $250 short.

function record(type: string, data: object): SyncedRecord {
  return { id: newRecordId(), revision: 1, body: recordBody(type, data) }
}

interface Ids {
  eatingOut: string
  groceries: string
  rent: string
  trip: string
}

function setup(extra: (ids: Ids) => SyncedRecord[] = () => []) {
  const cash: SyncedRecord = {
    id: newRecordId(),
    revision: 1,
    body: walletBody(newWalletRecord('Cash', 'MXN')),
  }
  const group = record(categoryGroupRecordType, { name: 'Everyday', color: 'lake' })
  const category = (data: Omit<CategoryRecord, 'groupId'>) =>
    record(categoryRecordType, { groupId: group.id, ...data })
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
  const rent = category({ name: 'Rent', kind: 'expense', icon: 'house', flexibility: 'locked' })
  const salary = category({ name: 'Salary', kind: 'income', icon: 'money', flexibility: 'fixed' })
  const trip = record(goalRecordType, {
    name: 'Trip',
    kind: 'save',
    target: 1_000_000,
    perMonth: 150_000,
    saved: 0,
    walletIds: [],
    start: '2026-03-01',
    order: 0,
  } satisfies GoalRecord)
  const transaction = (data: Omit<TransactionRecord, 'walletId'>): SyncedRecord => ({
    id: newRecordId(),
    revision: 1,
    body: transactionBody({ walletId: cash.id, ...data }),
  })
  const months = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']
  const history = months.flatMap((month, index) => [
    transaction({
      kind: 'income',
      date: `${month}-01`,
      amount: 400_000,
      categoryId: salary.id,
    }),
    transaction({ kind: 'expense', date: `${month}-02`, amount: -150_000, categoryId: rent.id }),
    transaction({
      kind: 'expense',
      date: `${month}-05`,
      amount: -100_000,
      categoryId: groceries.id,
    }),
    // $200 in September up to $300 in February: a usual $250, and $200 proven.
    transaction({
      kind: 'expense',
      date: `${month}-08`,
      amount: -(20_000 + index * 2000),
      categoryId: eatingOut.id,
    }),
  ])
  const ids: Ids = {
    eatingOut: eatingOut.id,
    groceries: groceries.id,
    rent: rent.id,
    trip: trip.id,
  }
  const records = [cash, group, groceries, eatingOut, rent, salary, trip, ...history, ...extra(ids)]
  const server: FakeServer = { signedIn: 'ana', records: [...records] }
  stubServer(server)
  const vault = unlockedVault(server)
  return { server, vault, ids, count: records.length }
}

function saved(server: FakeServer, type: string): { id: string; data: unknown }[] {
  return (server.records ?? [])
    .map((item) => ({ id: item.id, body: item.body }))
    .filter(
      (item): item is { id: string; body: Extract<RecordBody, { deleted: false }> } =>
        !item.body.deleted && item.body.type === type,
    )
    .map((item) => ({ id: item.id, data: item.body.data }))
}

/** SEC-01, NFR-05: records leave only through the vault, which encrypts them. */
function expectNothingInTheClear(text: string) {
  for (const [input, init] of vi.mocked(globalThis.fetch).mock.calls) {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input
    expect(url).toMatch(/^\/api\//)
    expect(typeof init?.body === 'string' ? init.body : '').not.toContain(text)
  }
}

configure({ asyncUtilTimeout: 5000 })

describe('what-ifs', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    // The main currency is guessed from the device: pesos, as the wallet holds.
    vi.spyOn(globalThis.navigator, 'language', 'get').mockReturnValue('es-MX')
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 2, 15, 12) })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('BUD-32, BUD-34, BUD-35, BUD-36: closing the gap suggests a Want cut, explains it and offers to ask less of a goal', async () => {
    const user = userEvent.setup()
    const { vault } = setup()
    renderApp('/budget/what-if', vault)

    expect(await screen.findByRole('heading', { name: 'What if…', level: 1 })).toBeVisible()
    expect(screen.getByText('Goals are still $250.00 short each month.')).toBeVisible()
    // Only eating out is a Want: 15% of its usual $250 frees $37.50, never below $200.
    await user.click(screen.getByRole('button', { name: /Close the gap/ }))
    const row = screen.getByRole('button', { name: /Eating out/ })
    expect(within(row).getByText('$37.50 a month')).toBeVisible()
    expect(
      within(row).getByText(
        '−15% to $212.50. You spent $200.00 in Sep 2025. About as many purchases, each a little smaller.',
      ),
    ).toBeVisible()
    expect(screen.getByText('Suggested to close the gap')).toBeVisible()
    expect(screen.getByText('$1,287.50')).toBeVisible()
    expect(screen.getByText('Goals are still $212.50 short each month.')).toBeVisible()
    // BUD-36: no more to cut within the limits, so the goal can ask for less.
    expect(
      screen.getByText('There’s no more to cut within the limits, so goals stay $212.50 short.'),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Put $1,287.50 a month into Trip' }))
    expect(await screen.findByText('Every goal is funded, with $0.00 to spare.')).toBeVisible()
    expect(screen.getByRole('button', { name: /Trip.*Changed here/ })).toBeVisible()
  })

  it('BUD-30, BUD-33: a Commitment is unlocked for the what-if before it changes', async () => {
    const user = userEvent.setup()
    const { vault } = setup()
    renderApp('/budget/what-if', vault)

    await user.click(await screen.findByRole('button', { name: 'Add a change' }))
    await user.click(await screen.findByRole('button', { name: /Spending on a category/ }))
    await user.click(await screen.findByRole('button', { name: /Rent/ }))
    expect(
      await screen.findByText(
        'Rent is a Commitment, a bill you’ve signed up for, so it stays as it is unless you unlock it for this what-if.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Percent' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Unlock for this what-if' }))
    const percent = screen.getByRole('textbox', { name: 'Percent' })
    await user.clear(percent)
    await user.type(percent, '10')
    // BUD-34: what it frees a month, a week and a year.
    expect(screen.getByText('New target $1,350.00. Frees $150.00 a month.')).toBeVisible()
    expect(screen.getByText('That’s $34.62 a week and $1,800.00 a year.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Done' }))

    const row = await screen.findByRole('button', { name: /Rent/ })
    expect(
      within(row).getByText(
        '−10% to $1,350.00. You haven’t spent that little in the last 6 months. About as many purchases, each a little smaller. Unlocked here.',
      ),
    ).toBeVisible()
    expect(screen.getByText('$1,400.00')).toBeVisible()
    expect(screen.getByText('Goals are still $100.00 short each month.')).toBeVisible()
  })

  it('BUD-31, BUD-39, SEC-01: a raise used as the plan from next month keeps this month as it is', async () => {
    const user = userEvent.setup()
    const { server, vault } = setup()
    renderApp('/budget/what-if', vault)

    await user.click(await screen.findByRole('button', { name: 'Add a change' }))
    await user.click(await screen.findByRole('button', { name: /Income/ }))
    expect(await screen.findByText('You expect $4,000.00 a month now.')).toBeVisible()
    await user.type(screen.getByRole('textbox', { name: 'Change each month' }), '500')
    await user.click(screen.getByRole('button', { name: 'Done' }))

    const row = await screen.findByRole('button', { name: /Income/ })
    expect(within(row).getByText('+$500.00 a month')).toBeVisible()
    expect(screen.getByText('Every goal is funded, with $250.00 to spare.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Use as my plan' }))
    const sheet = await screen.findByRole('dialog', { name: 'Use as my plan' })
    expect(within(sheet).getByRole('radio', { name: /From April/ })).toBeChecked()
    expect(within(sheet).getByRole('radio', { name: /From March, this month/ })).not.toBeChecked()
    await user.click(within(sheet).getByRole('button', { name: 'Use as my plan' }))

    await waitFor(() => {
      expect(saved(server, budgetPlanRecordType)).toHaveLength(1)
    })
    expect(saved(server, budgetPlanRecordType)[0]?.data).toMatchObject({
      income: 450_000,
      incomeByPeriod: [{ start: '2026-03-01', amount: 400_000 }],
      adjustments: [],
    })
    expect(vault.saveRecords).toHaveBeenCalled()
    expectNothingInTheClear('450000')
  })

  it('BUD-37, BUD-38: a phased cut is saved for later under a guessed name, then duplicated', async () => {
    const user = userEvent.setup()
    const { server, vault, ids } = setup()
    renderApp('/budget/what-if?gap=true', vault)

    const row = await screen.findByRole('button', { name: /Eating out/ })
    expect(within(row).getByText('$37.50 a month')).toBeVisible()
    await user.click(screen.getByRole('switch', { name: /Phase in over 3 months/ }))
    await user.click(screen.getByRole('button', { name: 'Save for later' }))
    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('Less on Eating out')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByRole('heading', { name: 'Less on Eating out', level: 1 }),
    ).toBeVisible()
    const [first] = saved(server, scenarioRecordType)
    expect(first?.data).toMatchObject({
      name: 'Less on Eating out',
      changes: [{ line: ids.eatingOut, kind: 'target', value: 21_250 }],
      steps: 3,
      goals: [],
    })
    expectNothingInTheClear('Less on Eating out')

    await user.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(
      await screen.findByRole('heading', { name: 'Less on Eating out copy', level: 1 }),
    ).toBeVisible()
    expect(saved(server, scenarioRecordType)).toHaveLength(2)
  })

  it('BUD-37, BUD-39: a phased cut used from this month steps toward its target', async () => {
    const user = userEvent.setup()
    const { server, vault, ids } = setup()
    renderApp('/budget/what-if?gap=true', vault)

    await user.click(await screen.findByRole('switch', { name: /Phase in over 3 months/ }))
    await user.click(screen.getByRole('button', { name: 'Use as my plan' }))
    const sheet = await screen.findByRole('dialog', { name: 'Use as my plan' })
    expect(within(sheet).getByText('Cuts grow over 3 months from then.')).toBeVisible()
    await user.click(within(sheet).getByRole('radio', { name: /From March, this month/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Use as my plan' }))

    await waitFor(() => {
      expect(saved(server, budgetPlanRecordType)).toHaveLength(1)
    })
    const plan = saved(server, budgetPlanRecordType)[0]?.data
    expect(plan).toMatchObject({
      adjustments: [{ line: ids.eatingOut, change: -3750, steps: 3, from: '2026-03-01' }],
    })
    expect(plan).not.toHaveProperty('income')
  })

  it('BUD-11: a category counts as another kind in the what-if only', async () => {
    const user = userEvent.setup()
    const { vault } = setup()
    renderApp('/budget/what-if', vault)

    await user.click(await screen.findByRole('button', { name: 'Add a change' }))
    await user.click(await screen.findByRole('button', { name: /Spending on a category/ }))
    await user.click(await screen.findByRole('button', { name: /Groceries/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Groceries' })
    const percent = within(sheet).getByRole('textbox', { name: 'Percent' })
    await user.clear(percent)
    await user.type(percent, '10')
    await user.click(within(sheet).getByRole('radio', { name: /^Want/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Done' }))

    const row = await screen.findByRole('button', { name: /Groceries/ })
    expect(within(row).getByText(/Counts as a Want here\.$/)).toBeVisible()
    expect(within(row).getByText('$100.00 a month')).toBeVisible()
    // Nothing is saved until the what-if is saved or used.
    expect(vault.saveRecords).not.toHaveBeenCalled()
  })

  it('BUD-38: saved what-ifs list newest first and open side by side', async () => {
    const user = userEvent.setup()
    const { vault } = setup((ids) => [
      record(scenarioRecordType, {
        name: 'Eat out less',
        changes: [{ line: ids.eatingOut, kind: 'target', value: 21_250 }],
        goals: [],
        unlocked: [],
        flexibility: [],
        steps: 1,
        createdAt: '2026-03-01T12:00:00.000Z',
      } satisfies ScenarioRecord),
      record(scenarioRecordType, {
        name: 'Side gig',
        changes: [],
        income: 50_000,
        goals: [],
        unlocked: [],
        flexibility: [],
        steps: 1,
        createdAt: '2026-03-10T12:00:00.000Z',
      } satisfies ScenarioRecord),
    ])
    renderApp('/budget/what-ifs', vault)

    const rows = await screen.findAllByRole('link', { name: /Side gig|Eat out less/ })
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('$1,750.00 left over · every goal funded'),
      expect.stringContaining('$1,287.50 left over · goals $212.50 short'),
    ])

    await user.click(screen.getByRole('button', { name: 'Compare' }))
    const sheet = await screen.findByRole('dialog', { name: 'Compare what-ifs' })
    expect(within(sheet).getByRole('checkbox', { name: 'Side gig' })).toBeChecked()
    expect(within(sheet).getByRole('checkbox', { name: 'Eat out less' })).toBeChecked()
    await user.click(within(sheet).getByRole('button', { name: 'Compare' }))

    expect(await screen.findByRole('heading', { name: 'Compare', level: 1 })).toBeVisible()
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Side gig' })).toBeVisible()
    expect(within(table).getByRole('columnheader', { name: 'Eat out less' })).toBeVisible()
    expect(within(table).getByText('now $1,250.00')).toBeVisible()
    expect(within(table).getByText('+$500.00 vs now')).toBeVisible()
    expect(within(table).getByText('+$37.50 vs now')).toBeVisible()
    // The trip gets $1,500 a month with the raise and $1,287.50 with the cut.
    expect(within(table).getByText('Sep 2026')).toBeVisible()
    expect(within(table).getByText('Oct 2026')).toBeVisible()
  })

  it('BUD-38: opening another what-if starts from its own changes', async () => {
    const { server, vault } = setup((ids) => [
      record(scenarioRecordType, {
        name: 'Eat out less',
        changes: [{ line: ids.eatingOut, kind: 'target', value: 21_250 }],
        goals: [],
        unlocked: [],
        flexibility: [],
        steps: 1,
      } satisfies ScenarioRecord),
    ])
    const id = (server.records ?? []).at(-1)?.id ?? ''
    const { router } = renderApp(`/budget/what-if?id=${id}`, vault)

    expect(await screen.findByRole('button', { name: /Eating out/ })).toBeVisible()
    await router.navigate({ to: '/budget/what-if' })
    expect(await screen.findByRole('heading', { name: 'What if…', level: 1 })).toBeVisible()
    expect(
      screen.getByText(
        'No changes yet. Add one to see what it does to your left over and your goals.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: /Eating out/ })).toBeNull()
  })

  it('BUD-38: deleting a saved what-if happens at once, with Undo', async () => {
    const user = userEvent.setup()
    const { server, vault } = setup((ids) => [
      record(scenarioRecordType, {
        name: 'Eat out less',
        changes: [{ line: ids.eatingOut, kind: 'target', value: 21_250 }],
        goals: [],
        unlocked: [],
        flexibility: [],
        steps: 1,
      } satisfies ScenarioRecord),
    ])
    const id = (server.records ?? []).at(-1)?.id ?? ''
    renderApp(`/budget/what-if?id=${id}`, vault)

    expect(await screen.findByRole('heading', { name: 'Eat out less', level: 1 })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Delete what-if' }))
    expect(await screen.findByText('Eat out less deleted')).toBeVisible()
    expect(saved(server, scenarioRecordType)).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => {
      expect(saved(server, scenarioRecordType)).toHaveLength(1)
    })
  })
})
