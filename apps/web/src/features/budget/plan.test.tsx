import {
  type BudgetPlanRecord,
  type MonthBudgetRecord,
  monthBudgetRecordType,
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

// Six months of the same salary, rent, insurance and groceries, and eating out that
// averages $200 (its lowest month $160); then March so far: the rent is paid, the
// insurance isn't yet and eating out is already over.
function history(
  cash: SyncedRecord,
  set: ReturnType<typeof categories>,
  /** What March, the month under way, has spent eating out so far. */
  marchEatingOut = 25_000,
): SyncedRecord[] {
  const months = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']
  const eatingOut = [20_000, 16_000, 24_000, 20_000, 18_000, 22_000]
  const spend = (date: string, category: SyncedRecord, amount: number) =>
    transaction({
      kind: 'expense',
      walletId: cash.id,
      date,
      amount: -amount,
      categoryId: category.id,
    })
  return [
    ...months.flatMap((month, index) => [
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
      spend(`${month}-08`, set.eatingOut, eatingOut[index] ?? 0),
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
    spend('2026-03-08', set.eatingOut, marchEatingOut),
  ]
}

/** BUD-71: a month's budget as the person locked it in: the usual month, $2,500 in all. */
function locked(
  set: ReturnType<typeof categories>,
  start: string,
  changes: Partial<Record<'rent' | 'insurance' | 'groceries' | 'eatingOut', number>> = {},
): SyncedRecord {
  const amounts = { rent: 120_000, insurance: 10_000, groceries: 100_000, eatingOut: 20_000 }
  const data: MonthBudgetRecord = {
    start,
    targets: Object.entries({ ...amounts, ...changes })
      .map(([key, amount]) => ({ line: set[key as keyof typeof amounts].id, amount }))
      .sort((a, b) => a.line.localeCompare(b.line)),
    income: 400_000,
    lockedAt: `${start}T09:00:00.000Z`,
  }
  return record(monthBudgetRecordType, data)
}

/** The month's budget saved, by its first day. */
function monthSaved(server: FakeServer, start: string) {
  return saved<MonthBudgetRecord>(server, monthBudgetRecordType).find(
    (item) => item.start === start,
  )
}

/** A month's target for one category, as saved. */
function targetOf(month: MonthBudgetRecord | undefined, category: SyncedRecord) {
  return month?.targets.find((item) => item.line === category.id)?.amount
}

const trip = (target = 1_200_000) =>
  record(goalRecordType, {
    name: 'Trip to Oaxaca',
    kind: 'save',
    target,
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

  it('BUD-70, BUD-71: before the first lock-in, the month is made on its page and counts once locked in', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set)],
    }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    // BUD-01: each amount starts as the 6-month average.
    expect(await screen.findByRole('heading', { name: 'March budget' })).toBeVisible()
    expect(screen.getByText('Not locked in yet')).toBeVisible()
    const field = screen.getByRole('textbox', { name: 'Eating out' })
    expect(field).toHaveValue('200.00')
    expect(screen.getByRole('textbox', { name: 'Expected income' })).toHaveValue('4,000.00')
    // BUD-74: nothing to review, since February had no budget.
    expect(screen.queryByRole('link', { name: /February has ended/ })).toBeNull()

    // BUD-04: a changed amount saves as the field is left, and shows what it was.
    await user.clear(field)
    await user.type(field, '300')
    await user.tab()
    await waitFor(() => {
      expect(targetOf(monthSaved(server, '2026-03-01'), set.eatingOut)).toBe(30_000)
    })
    const draft = monthSaved(server, '2026-03-01')
    expect(draft?.lockedAt).toBeUndefined()
    expect(targetOf(draft, set.rent)).toBe(120_000)
    expect(draft?.income).toBe(400_000)
    expect(row('Eating out').getByText('Usual $200.00')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Lock in March' }))
    expect(await screen.findByText('Left in March')).toBeVisible()
    expect(monthSaved(server, '2026-03-01')?.lockedAt).toBeDefined()
    expect(screen.getByText(/^of \$2,600\.00 budgeted/)).toBeVisible()
    expect(row('Eating out').getByText('$50.00 left')).toBeVisible()
  })

  it('BUD-40, BUD-41, BUD-43, BUD-50: a month locked in shows what is left, each category by Wants, Needs and Commitments', async () => {
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [
        cash,
        ...set.records,
        ...history(cash, set),
        locked(set, '2026-02-01'),
        locked(set, '2026-03-01'),
      ],
    }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    expect(await screen.findByText('Left in March')).toBeVisible()
    expect(screen.getByText(/^of \$2,500\.00 budgeted/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Plan', pressed: true })).toBeVisible()
    expect(screen.getByText('Locked in')).toBeVisible()
    expect(section('Wants').getByText('Eating out')).toBeVisible()
    expect(row('Eating out').getByText('$50.00 over')).toBeVisible()
    expect(section('Needs').getByText('Groceries')).toBeVisible()
    expect(row('Groceries').getByText('$700.00 left')).toBeVisible()
    // Alejandro's call: a Commitment says whether it was paid, not a bar.
    expect(row('Rent').getByText(/^Paid /)).toBeVisible()
    expect(row('Insurance').getByText('Not paid yet')).toBeVisible()
    // BUD-50: February had a budget, so it waits for its review.
    expect(screen.getByRole('link', { name: /February has ended/ })).toBeVisible()
    expect(screen.getByText('Locked in on Mar 1.')).toBeVisible()
  })

  it('BUD-41: a switch shows the categories by category group instead, and stays that way', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set), locked(set, '2026-03-01')],
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

  it('BUD-71, BUD-72: a locked budget changes only through Edit, and keeps being locked in', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set), locked(set, '2026-03-01')],
    }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    expect(await screen.findByText('Left in March')).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Groceries' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const field = await screen.findByRole('textbox', { name: 'Groceries' })
    await user.clear(field)
    await user.type(field, '900')
    await user.tab()
    await waitFor(() => {
      expect(targetOf(monthSaved(server, '2026-03-01'), set.groceries)).toBe(90_000)
    })
    expect(monthSaved(server, '2026-03-01')?.lockedAt).toBe('2026-03-01T09:00:00.000Z')
    expect(row('Groceries').getByText('Was $1,000.00')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText(/^of \$2,400\.00 budgeted/)).toBeVisible()
    expect(row('Groceries').getByText('$600.00 left')).toBeVisible()
  })

  it('BUD-73: a month that begins without a lock-in carries on the last budget', async () => {
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [
        cash,
        ...set.records,
        ...history(cash, set),
        locked(set, '2026-02-01', { eatingOut: 30_000 }),
      ],
    }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    expect(await screen.findByText('Left in March')).toBeVisible()
    expect(screen.getByText('Carries on February’s budget')).toBeVisible()
    expect(row('Eating out').getByText('$50.00 left')).toBeVisible()
    expect(screen.getByText('Not locked in, so it carries on February’s budget.')).toBeVisible()
  })

  it('BUD-75: from 14 days before, next month asks for its budget, made the same way', async () => {
    vi.setSystemTime(new Date(2026, 2, 20, 12))
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set), locked(set, '2026-03-01')],
    }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    expect(await screen.findByText('April starts in 12 days')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Plan April' }))

    // BUD-70: April starts from March's budget.
    expect(await screen.findByRole('heading', { name: 'April budget' })).toBeVisible()
    expect(screen.getByText('Starts Apr 1 · from March’s budget')).toBeVisible()
    const rent = screen.getByRole('textbox', { name: 'Rent' })
    expect(rent).toHaveValue('1,200.00')
    await user.clear(rent)
    await user.type(rent, '1500')
    await user.tab()
    expect(await screen.findByText('Was $1,200.00')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Lock in April' }))

    await waitFor(() => {
      expect(monthSaved(server, '2026-04-01')?.lockedAt).toBeDefined()
    })
    expect(targetOf(monthSaved(server, '2026-04-01'), set.rent)).toBe(150_000)
    // March stays as it was locked in.
    expect(targetOf(monthSaved(server, '2026-03-01'), set.rent)).toBe(120_000)
    expect(await screen.findByText('Locked in · starts Apr 1')).toBeVisible()
  })

  it('BUD-04: a category’s target changes in this month’s budget only', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set), locked(set, '2026-03-01')],
    }
    stubServer(server)
    renderApp(`/budget/line/${set.eatingOut.id}`, unlockedVault(server))

    await user.click(await screen.findByRole('button', { name: /^In March/ }))
    const field = await screen.findByRole('textbox', { name: 'Target' })
    await user.clear(field)
    await user.type(field, '300')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(targetOf(monthSaved(server, '2026-03-01'), set.eatingOut)).toBe(30_000)
    })
    const month = monthSaved(server, '2026-03-01')
    expect(month?.lockedAt).toBe('2026-03-01T09:00:00.000Z')
    expect(targetOf(month, set.groceries)).toBe(100_000)
    expect(await screen.findByText('Usual $200.00')).toBeVisible()
    expect(screen.getByText('$50.00 left')).toBeVisible()
  })

  it('BUD-06: with no month to learn from, every category takes a rough amount from day one', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = { signedIn: 'ana', records: [cash, ...set.records] }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    expect(await screen.findByRole('heading', { name: 'March budget' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Import past statements/ })).toBeVisible()
    await user.type(screen.getByRole('textbox', { name: 'Expected income' }), '4000')
    await user.type(screen.getByRole('textbox', { name: 'Rent' }), '1200')
    await user.type(screen.getByRole('textbox', { name: 'Eating out' }), '300')
    await user.tab()

    await waitFor(() => {
      expect(targetOf(monthSaved(server, '2026-03-01'), set.eatingOut)).toBe(30_000)
    })
    const draft = monthSaved(server, '2026-03-01')
    expect(draft?.income).toBe(400_000)
    expect(targetOf(draft, set.rent)).toBe(120_000)
    await user.click(screen.getByRole('button', { name: 'Lock in March' }))
    expect(await screen.findByText('Left in March')).toBeVisible()
    expect(screen.getByText(/^of \$1,500\.00 budgeted/)).toBeVisible()
  })

  it('BUD-02, BUD-76: a one-off stays out of its starting amount until the person counts it', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const banquet = transaction({
      kind: 'expense',
      walletId: cash.id,
      date: '2025-12-14',
      amount: -120_000,
      categoryId: set.eatingOut.id,
      note: 'Wedding banquet',
    })
    const server: FakeServer = {
      signedIn: 'ana',
      records: [cash, ...set.records, ...history(cash, set), banquet],
    }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    // $1,200 is over 3 times the usual $200, so the average leaves it out.
    expect(await screen.findByRole('textbox', { name: 'Eating out' })).toHaveValue('200.00')
    await user.click(screen.getByRole('link', { name: /One-offs left out/ }))

    const banquetRow = await screen.findByRole('switch', { name: /Eating out · \$1,200\.00/ })
    expect(banquetRow).toBeChecked()
    expect(screen.getByText('Dec 14, 2025 · over 3 times your usual $200.00')).toBeVisible()
    await user.click(banquetRow)
    await waitFor(() => {
      expect(saved<BudgetPlanRecord>(server, 'budgetPlan')[0]?.exclusions.counted).toEqual([
        banquet.id,
      ])
    })
    expect(await screen.findByRole('switch', { name: /Eating out/ })).not.toBeChecked()
  })

  it('BUD-32, BUD-35: Find money suggests smaller Wants, and the cuts go into the month’s budget', async () => {
    const user = userEvent.setup()
    const cash = wallet('Cash')
    const set = categories()
    const server: FakeServer = {
      signedIn: 'ana',
      // $100 spent eating out so far: a cut never goes below what is already spent.
      records: [cash, ...set.records, ...history(cash, set, 10_000), trip(2_000_000)],
    }
    stubServer(server)
    renderApp('/budget', unlockedVault(server))

    // $20,000 by December needs $2,000 a month, and only $1,500 is left over.
    expect(await screen.findByText('Apr 2027 · 4 months later')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Find money for your goals/ }))

    const dialog = within(await screen.findByRole('dialog'))
    // Eating out at most 15% less, and not below its lowest month, $160.
    expect(dialog.getByRole('checkbox', { name: /^Eating out · \$170\.00/ })).toBeChecked()
    expect(dialog.getByText(/You last spent that little in/)).toBeVisible()
    expect(dialog.getByText('Your goals would still be $470.00 short each month.')).toBeVisible()
    await user.click(dialog.getByRole('button', { name: 'Use in March’s budget' }))

    await waitFor(() => {
      expect(targetOf(monthSaved(server, '2026-03-01'), set.eatingOut)).toBe(17_000)
    })
    expect(monthSaved(server, '2026-03-01')?.lockedAt).toBeUndefined()
    // The field now says what it was: "Eating out, Usual $200.00".
    expect(await screen.findByRole('textbox', { name: /^Eating out/ })).toHaveValue('170.00')
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
    // BUD-03: a whole month left out of the starting amounts.
    await user.click(screen.getByRole('checkbox', { name: 'January' }))
    await waitFor(() => {
      expect(saved<BudgetPlanRecord>(server, 'budgetPlan')[0]?.exclusions.periods).toEqual([
        '2026-01-01',
      ])
    })
  })
})
