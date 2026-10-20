import {
  type BudgetPlanRecord,
  type BudgetSnapshotRecord,
  budgetSnapshotRecordType,
  type CategoryRecord,
  categoryGroupRecordType,
  categoryRecordType,
  type GoalContributionRecord,
  goalRecordType,
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
      records: [cash, ...set.records, ...history(cash, set), trip()],
    }
    stubServer(server)
    renderApp('/budget/review', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'February review', level: 1 })).toBeVisible()
    expect(screen.getByText('Planned left over')).toBeVisible()
    expect(screen.getByText(/less than planned\.$/)).toBeVisible()
    // Eating out went over its usual month; groceries landed on it.
    const results = within(section('How each category did'))
    const eatingOut = results.getByText('Eating out').closest('li')
    expect(within(eatingOut as HTMLElement).getByText(/over$/)).toBeVisible()
    expect(screen.getByText(/^1 category went over, by/)).toBeVisible()
    // Nothing extra, so nothing to send to the goals.
    expect(screen.queryByText(/Send the extra/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Start March' })).toBeVisible()
  })

  it('BUD-52, BUD-55, BUD-56: starting March keeps February as it was, its targets and what carries', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set)],
    }
    stubServer(server)
    renderApp('/budget/review', unlockedVault(server))

    const carry = await screen.findByRole('switch', { name: /Eating out/ })
    // BUD-52: nothing carries unless switched on.
    expect(carry).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: /Keep February's/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await user.click(carry)
    await user.click(screen.getByRole('button', { name: 'Start March' }))

    await waitFor(() => {
      expect(saved<BudgetSnapshotRecord>(server, budgetSnapshotRecordType)).toHaveLength(1)
    })
    const [snapshot] = saved<BudgetSnapshotRecord>(server, budgetSnapshotRecordType)
    expect(snapshot).toMatchObject({ start: '2026-02-01', end: '2026-02-28', targets: 'kept' })
    expect(snapshot?.lines.map((line) => line.line)).toEqual(
      expect.arrayContaining([set.groceries.id, set.eatingOut.id]),
    )
    const eatingOut = snapshot?.lines.find((line) => line.line === set.eatingOut.id)
    expect(eatingOut?.spent).toBe(30_000)
    expect(snapshot?.carry).toEqual([
      { line: set.eatingOut.id, amount: (eatingOut?.target ?? 0) - 30_000 },
    ])
    expect(snapshot?.leftOver.actual).toBe(400_000 - 100_000 - 30_000)
    // BUD-55, Q8: next month starts from February's targets.
    const [plan] = saved<BudgetPlanRecord>(server, 'budgetPlan')
    expect(plan?.targets).toContainEqual({ line: set.eatingOut.id, amount: eatingOut?.target })
    // The review is done, so Budget opens again without it.
    expect(await screen.findByRole('link', { name: /Past months/ })).toBeVisible()
    expect(screen.queryByRole('link', { name: /February review/ })).toBeNull()
  })

  it('BUD-51: the extra fills the goals in order, and a goal without a wallet gets it as money added', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const goal = trip()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set), bonus(cash, set), goal],
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

  it('BUD-54: a Want over its target three months running gets an easier target from next month', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set), trip()],
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
      expect(saved<BudgetPlanRecord>(server, 'budgetPlan')).toHaveLength(1)
    })
    const [plan] = saved<BudgetPlanRecord>(server, 'budgetPlan')
    expect(plan?.targets).toContainEqual({ line: set.eatingOut.id, amount: 28_000, byHand: true })
  })

  it('BUD-57, BUD-56: past months list each close, newest first, and open one as it was', async () => {
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
          { line: set.eatingOut.id, flexibility: 'flexible', target: 24_000, spent: 30_000 },
        ],
        income: { planned: 400_000, actual: 400_000 },
        leftOver: { planned: 276_000, actual },
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
        targets: 'kept',
        closedAt: `${end}T18:00:00.000Z`,
      } satisfies BudgetSnapshotRecord)
    const server: FakeServer = {
      signedIn: 'ana',
      records: [
        cash,
        ...set.records,
        ...history(cash, set),
        goal,
        snapshot('2026-01-01', '2026-01-31', 272_000, '2026-11-30'),
        snapshot('2026-02-01', '2026-02-28', 270_000, '2026-12-31'),
      ],
    }
    stubServer(server)
    renderApp('/budget/history', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'Past months', level: 1 })).toBeVisible()
    const rows = await screen.findAllByRole('link', { name: /2026/ })
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^February 2026/),
      expect.stringMatching(/^January 2026/),
    ])
    // BUD-57: the trip's date moved a month later from one close to the next.
    expect(screen.getByText('Nov 2026 → Dec 2026')).toBeVisible()

    const latest = rows[0]
    if (!latest) throw new Error('No closed month')
    await user.click(latest)
    expect(await screen.findByRole('heading', { name: 'February 2026', level: 1 })).toBeVisible()
    const eatingOut = screen.getByText('Eating out').closest('li')
    expect(within(eatingOut as HTMLElement).getByText('$60.00 over')).toBeVisible()
    expect(screen.getByText('$500.00 of $12,000.00 · expected Dec 2026')).toBeVisible()
  })

  it('SEC-01: closing a month stores it through the vault and calls only the app’s server', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const records = [cash, ...set.records, ...history(cash, set), bonus(cash, set), trip()]
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
