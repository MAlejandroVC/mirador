import {
  type BudgetSnapshotRecord,
  budgetSnapshotRecordType,
  type CategoryRecord,
  categoryGroupRecordType,
  categoryRecordType,
  type GoalContributionRecord,
  goalRecordType,
  type MonthBudgetRecord,
  monthBudgetRecordType,
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
    groceries,
    eatingOut,
    salary,
  }
}

// Six months of the same salary and groceries, with eating out growing $20 a month, so
// it ends every month a little over its usual; then March so far. February waits for
// its review.
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
  ]
}

/**
 * BUD-71, BUD-73: December's budget, locked in, which January, February and March carry
 * on: groceries at $1,000 and eating out at $250.
 */
function december(set: ReturnType<typeof categories>): SyncedRecord {
  return record(monthBudgetRecordType, {
    start: '2025-12-01',
    targets: [
      { line: set.groceries.id, amount: 100_000 },
      { line: set.eatingOut.id, amount: 25_000 },
    ].sort((a, b) => a.line.localeCompare(b.line)),
    income: 400_000,
    lockedAt: '2025-11-28T18:00:00.000Z',
  } satisfies MonthBudgetRecord)
}

/** A bonus in February, so the month ends with more left over than planned. */
function bonus(cash: SyncedRecord, set: ReturnType<typeof categories>) {
  return transaction({
    kind: 'income',
    walletId: cash.id,
    date: '2026-02-20',
    amount: 50_000,
    categoryId: set.salary.id,
  })
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

/** A list on screen once it shows, by its section label. */
async function section2(label: string) {
  const heading = await screen.findByRole('heading', { name: label })
  const list = heading.closest('section')
  if (!list) throw new Error(`No list labeled ${label}`)
  return list
}

/** A list on screen, by its section label. */
function section(label: string) {
  const heading = screen.getByRole('heading', { name: label })
  const list = heading.closest('section')
  if (!list) throw new Error(`No list labeled ${label}`)
  return list
}

function saved<T>(server: FakeServer, type: string) {
  return (server.records ?? [])
    .map((item) => item.body)
    .filter((body): body is Extract<RecordBody, { deleted: false }> => !body.deleted)
    .filter((body) => body.type === type)
    .map((body) => body.data as T)
}

configure({ asyncUtilTimeout: 5000 })

describe('closing a month', () => {
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

  it('BUD-50, BUD-53: the month just ended, planned against lived, and what going over did', async () => {
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set), december(set), trip()],
    }
    stubServer(server)
    renderApp('/budget/review', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'February review', level: 1 })).toBeVisible()
    expect(screen.getByText('Planned left over')).toBeVisible()
    expect(screen.getByText(/less than planned\.$/)).toBeVisible()
    // Eating out went over its target; groceries landed on it.
    const results = within(section('How each category did'))
    const eatingOut = results.getByText('Eating out').closest('li')
    expect(within(eatingOut as HTMLElement).getByText(/over$/)).toBeVisible()
    expect(screen.getByText(/^1 category went over, by/)).toBeVisible()
    // Nothing extra, so nothing to send to the goals.
    expect(screen.queryByText(/Send the extra/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Start March' })).toBeVisible()
  })

  it('BUD-50, BUD-74: a month without a budget gets no review', async () => {
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set)],
    }
    stubServer(server)
    renderApp('/budget/review', unlockedVault(server))

    expect(await screen.findByText('Nothing to review yet')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Start March' })).toBeNull()
  })

  it('BUD-52, BUD-55, BUD-56: starting March keeps February as it was, and what carries', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set), december(set)],
    }
    stubServer(server)
    renderApp('/budget/review', unlockedVault(server))

    const carry = await screen.findByRole('switch', { name: /Eating out/ })
    // BUD-52: nothing carries unless switched on.
    expect(carry).toHaveAttribute('aria-checked', 'false')
    // BUD-55: March keeps the budget it carries on.
    expect(
      screen.getByText('March’s budget stays as it is. You can edit it any time.'),
    ).toBeVisible()
    await user.click(carry)
    await user.click(screen.getByRole('button', { name: 'Start March' }))

    await waitFor(() => {
      expect(saved<BudgetSnapshotRecord>(server, budgetSnapshotRecordType)).toHaveLength(1)
    })
    const [snapshot] = saved<BudgetSnapshotRecord>(server, budgetSnapshotRecordType)
    expect(snapshot).toMatchObject({ start: '2026-02-01', end: '2026-02-28' })
    expect(snapshot?.lines.map((line) => line.line)).toEqual(
      expect.arrayContaining([set.groceries.id, set.eatingOut.id]),
    )
    const eatingOut = snapshot?.lines.find((line) => line.line === set.eatingOut.id)
    expect(eatingOut).toMatchObject({ target: 25_000, spent: 30_000 })
    expect(snapshot?.carry).toEqual([{ line: set.eatingOut.id, amount: -5_000 }])
    expect(snapshot?.leftOver.actual).toBe(400_000 - 100_000 - 30_000)
    // BUD-55, Q8: no month's budget changed.
    expect(saved<MonthBudgetRecord>(server, monthBudgetRecordType)).toHaveLength(1)
    // The review is done, so Budget opens again without it.
    expect(await screen.findByText('Left in March')).toBeVisible()
    expect(screen.queryByRole('link', { name: /February has ended/ })).toBeNull()
  })

  it('BUD-51: the extra fills the goals in order, and a goal without a wallet gets it as money added', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const goal = trip()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set), december(set), bonus(cash, set), goal],
    }
    stubServer(server)
    renderApp('/budget/review', unlockedVault(server))

    expect(await screen.findByText(/more than planned\.$/)).toBeVisible()
    const row = screen.getByRole('button', { name: /Trip to Oaxaca/ })
    expect(screen.getByText(/^Send the extra/i)).toBeVisible()
    expect(screen.getByText('Keep unassigned')).toBeVisible()
    // Change it to $100 in its own sheet.
    await user.click(row)
    const field = await screen.findByRole('textbox', { name: 'To this goal' })
    await user.clear(field)
    await user.type(field, '100')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /save/i }))
    await waitFor(() => {
      expect(within(row).getByText('$100.00')).toBeVisible()
    })

    await user.click(screen.getByRole('button', { name: 'Start March' }))
    await waitFor(() => {
      expect(saved<BudgetSnapshotRecord>(server, budgetSnapshotRecordType)).toHaveLength(1)
    })
    expect(saved<GoalContributionRecord>(server, 'goalContribution')).toEqual([
      { goalId: goal.id, amount: 10_000, date: '2026-02-28' },
    ])
    const [snapshot] = saved<BudgetSnapshotRecord>(server, budgetSnapshotRecordType)
    expect(snapshot?.surplus).toEqual([{ goalId: goal.id, amount: 10_000 }])
    expect(snapshot?.goals).toEqual([
      expect.objectContaining({ goalId: goal.id, name: 'Trip to Oaxaca', progress: 10_000 }),
    ])
  })

  it('BUD-54: a Want over its target three months running gets an easier target in next month’s budget', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set), december(set), trip()],
    }
    stubServer(server)
    renderApp('/budget/review', unlockedVault(server))

    expect(await screen.findByText('Eating out went over 3 months in a row.')).toBeVisible()
    // December to February spent $260, $280 and $300: the middle one holds.
    expect(screen.getByText(/^Easing its target to \$280\.00/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Ease the target' }))
    expect(screen.getByText('Its target will be $280.00 from March on.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Start March' }))

    await waitFor(() => {
      expect(
        saved<MonthBudgetRecord>(server, monthBudgetRecordType).find(
          (item) => item.start === '2026-03-01',
        ),
      ).toBeDefined()
    })
    const march = saved<MonthBudgetRecord>(server, monthBudgetRecordType).find(
      (item) => item.start === '2026-03-01',
    )
    expect(march?.targets).toContainEqual({ line: set.eatingOut.id, amount: 28_000 })
    expect(march?.targets).toContainEqual({ line: set.groceries.id, amount: 100_000 })
  })

  it('BUD-57: a past month opens from the month bar, and a goal shows its date at each close', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const goal = trip()
    const snapshot = (start: string, end: string, actual: number, projected: string) =>
      record(budgetSnapshotRecordType, {
        start,
        end,
        lines: [
          { line: set.groceries.id, flexibility: 'fixed', target: 100_000, spent: 100_000 },
          { line: set.eatingOut.id, flexibility: 'flexible', target: 25_000, spent: 30_000 },
        ],
        income: { planned: 400_000, actual: 400_000 },
        leftOver: { planned: 275_000, actual },
        goals: [
          {
            goalId: goal.id,
            name: 'Trip to Oaxaca',
            progress: 50_000,
            target: 1_200_000,
            contributed: 10_000,
            need: 115_000,
            projected,
          },
        ],
        surplus: [],
        carry: [],
        closedAt: `${end}T18:00:00.000Z`,
      } satisfies BudgetSnapshotRecord)
    const server: FakeServer = {
      signedIn: 'ana',
      records: [
        cash,
        ...set.records,
        ...history(cash, set),
        december(set),
        goal,
        snapshot('2026-01-01', '2026-01-31', 272_000, '2026-11-30'),
        snapshot('2026-02-01', '2026-02-28', 270_000, '2026-12-31'),
      ],
    }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    expect(await screen.findByText('Left in March')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(await screen.findByText('Over in February')).toBeVisible()
    const eatingOut = screen.getByText('Eating out').closest('li')
    expect(within(eatingOut as HTMLElement).getByText('$50.00 over')).toBeVisible()
    expect(screen.queryByRole('textbox')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(await screen.findByRole('link', { name: /Trip to Oaxaca/ }))
    const dates = within(await section2('Expected date at each close'))
    expect(dates.getByText('January')).toBeVisible()
    expect(dates.getByText('Nov 2026')).toBeVisible()
    expect(dates.getByText('Dec 2026')).toBeVisible()
  })

  it('SEC-01: closing a month stores it through the vault and calls only the app’s server', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const records = [
      cash,
      ...set.records,
      ...history(cash, set),
      december(set),
      bonus(cash, set),
      trip(),
    ]
    const server: FakeServer = { signedIn: 'ana', records: [...records] }
    stubServer(server)
    const fetches = vi.mocked(globalThis.fetch)
    renderApp('/budget/review', unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: 'Start March' }))
    await waitFor(() => {
      expect(saved<BudgetSnapshotRecord>(server, budgetSnapshotRecordType)).toHaveLength(1)
    })
    // The records go to the vault, which encrypts them before they sync (SEC-01); the
    // page itself sends nothing about them, and only to its own server (NFR-05).
    for (const [input, init] of fetches.mock.calls) {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input
      expect(url).toMatch(/^\/api\//)
      const body = typeof init?.body === 'string' ? init.body : ''
      expect(body).not.toMatch(/Trip to Oaxaca|budgetSnapshot|goalContribution/)
    }
  })
})
