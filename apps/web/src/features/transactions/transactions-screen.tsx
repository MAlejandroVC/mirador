import {
  activeFilters,
  amountIn,
  byDay,
  flowTotals,
  inPeriod,
  isRefund,
  matchesFilter,
  newestFirst,
  occurrenceFields,
  type PeriodScope,
  periodOf,
  shiftPeriod,
  sortTransactions,
  spreadInstallments,
  toCalendarDate,
  upcoming,
  type Transaction,
  type TransactionFilter,
  type TransactionSort,
} from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountButton } from '../../components/shell'
import { Amount } from '../../components/ui/amount'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { EmptyState } from '../../components/ui/empty-state'
import {
  ArrowsDownUpIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  FunnelIcon,
  ReceiptIcon,
} from '../../components/ui/icons'
import { List, ListLinkRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { Sheet } from '../../components/ui/sheet'
import { ToolbarButton } from '../../components/ui/toolbar-button'
import { formatDay, formatPeriod, formatShortDate, useMoney } from '../../lib/format'
import { taxonomy } from '../categories/lookups'
import { useQuickAdd } from '../quick-add'
import { repeatLabel } from '../recurring/labels'
import { RecurringRow } from '../recurring/upcoming-row'
import { useLedger } from '../wallets/use-ledger'
import { FilterSheet } from './filter-sheet'
import { SortSheet } from './sort-sheet'
import { TransactionRow } from './transaction-row'
import { useTransactionEditor } from './use-transaction-editor'

/** ANA-04: what a chart in Budget opens the list on: a period and one thing to filter by. */
export interface TransactionsSearch {
  date?: string
  scope?: PeriodScope
  wallet?: string
  group?: string
  category?: string
  tag?: string
  payee?: string
}

/**
 * ANA-04: the filter a drill-down opens with: the one thing the chart showed. Refunds
 * in it show too, as the money in that lowered its spending (TXN-11).
 */
function searchFilter(search: TransactionsSearch): TransactionFilter {
  const { wallet, group, category, tag, payee } = search
  if (!wallet && !group && !category && !tag && !payee) return {}
  return {
    ...(wallet ? { walletIds: [wallet] } : {}),
    ...(group ? { groupIds: [group] } : {}),
    ...(category ? { categoryIds: [category] } : {}),
    ...(tag ? { tagIds: [tag] } : {}),
    ...(payee ? { payeeIds: [payee] } : {}),
  }
}

// How many rows show at first, and how many more each "Show more" adds.
const page = 100
const scopes: readonly PeriodScope[] = ['week', 'month', 'quarter', 'year']

// Epic 2: the transactions of one period, a month unless the person picks a week, a
// quarter or a year, with arrows to the ones before and after (TXN-22). Above the
// list, the period's income, spending and net (TXN-24); each day shows its own net
// (TXN-28). Sort and Filter sit beside the title (TXN-21, TXN-22). Tapping a row opens
// it; swiping it left deletes it, with Undo (DL-CMP-07, TXN-13). A purchase in
// installments counts one installment in each month (TXN-32). Above this period's
// days, what recurring transactions have coming, and a way to all of them (TXN-09).
// The arrows go on into months to come, to see what is scheduled there.
export function TransactionsScreen({ search = {} }: { search?: TransactionsSearch }) {
  const { t } = useTranslation()
  const { data: ledger } = useLedger()
  const quickAdd = useQuickAdd()
  const editor = useTransactionEditor()
  const today = toCalendarDate(new Date())
  const [scope, setScope] = useState<PeriodScope>(search.scope ?? 'month')
  const [anchor, setAnchor] = useState(search.date ?? today)
  const [sort, setSort] = useState<TransactionSort>('newest')
  const [filter, setFilter] = useState<TransactionFilter>(() => searchFilter(search))
  const [sheet, setSheet] = useState<'scope' | 'sort' | 'filter' | null>(null)
  const [limit, setLimit] = useState(page)
  const defaultCurrency = ledger?.defaultCurrency ?? 'USD'
  const money = useMoney(defaultCurrency)
  const filters = activeFilters(filter)

  const actions = (
    <>
      <ToolbarButton
        icon={ArrowsDownUpIcon}
        label={t('sort.title')}
        active={sort !== 'newest'}
        onClick={() => {
          setSheet('sort')
        }}
      />
      <ToolbarButton
        icon={FunnelIcon}
        label={filters > 0 ? t('filters.titleCount', { count: filters }) : t('filters.title')}
        active={filters > 0}
        onClick={() => {
          setSheet('filter')
        }}
      />
      <AccountButton />
    </>
  )

  if (!ledger) return <Page title={t('nav.transactions')} actions={<AccountButton />} />

  const wallets = new Map(ledger.wallets.map((wallet) => [wallet.id, wallet]))
  const currencies = new Map(ledger.wallets.map((wallet) => [wallet.id, wallet.currency]))
  const lookups = taxonomy(ledger)
  // A transaction whose wallet is gone has nowhere to show (WAL-08 deletes them too).
  const kept = ledger.transactions.filter((transaction) => wallets.has(transaction.walletId))
  const purchases = new Map(kept.map((transaction) => [transaction.id, transaction]))
  // TXN-32: spending counts a purchase in installments one installment a month.
  const all = spreadInstallments(kept)
  const recurrings = ledger.recurring.filter((recurring) => wallets.has(recurring.walletId))
  const opened = (transaction: Transaction & { part?: { purchaseId: string } }) =>
    (transaction.part && purchases.get(transaction.part.purchaseId)) ?? transaction

  if (all.length === 0 && recurrings.length === 0)
    return (
      <Page title={t('nav.transactions')} actions={<AccountButton />}>
        {/* DL-CMP-14, DL-VOC-02: a touch of whimsy where nothing is there yet. */}
        <EmptyState
          icon={ReceiptIcon}
          title={t('transactions.empty.title')}
          action={
            <Button className="mt-1 px-6" onClick={quickAdd.open}>
              {t('transactions.empty.action')}
            </Button>
          }
        >
          {t('transactions.empty.body')}
        </EmptyState>
        {editor.sheet}
      </Page>
    )

  const period = periodOf(anchor, scope)
  const periodName = formatPeriod(period, scope, money.locale, (number, year) =>
    t('transactions.period.quarter', { number, year }),
  )
  const filterLookups = {
    categoryId: (transaction: Transaction) => lookups.categoryOf(transaction)?.id ?? null,
    groupId: (transaction: Transaction) => lookups.categoryOf(transaction)?.groupId ?? null,
    payeeName: (transaction: Transaction) =>
      transaction.payeeId === undefined
        ? null
        : (lookups.payees.get(transaction.payeeId)?.name ?? null),
  }
  const inView = all.filter(
    (transaction) =>
      inPeriod(transaction.date, period) && matchesFilter(transaction, filter, filterLookups),
  )
  const ordered =
    sort === 'newest'
      ? newestFirst(inView)
      : sortTransactions(inView, sort, {
          size: (transaction) =>
            Math.abs(
              amountIn(transaction, currencies, defaultCurrency, ledger.rates) ??
                transaction.amount,
            ),
          categoryName: (transaction) => lookups.categoryOf(transaction)?.name ?? '',
          groupName: (transaction) => {
            const category = lookups.categoryOf(transaction)
            return (category && lookups.groupOf(category)?.name) ?? ''
          },
          walletName: (transaction) => wallets.get(transaction.walletId)?.name ?? '',
        })
  // Days stay as long as the list runs by date; any other order is one flat list.
  const byDate = sort === 'newest' || sort === 'oldest'
  const shown = ordered.slice(0, limit)
  const words = { today: t('dates.today'), yesterday: t('dates.yesterday') }
  // TXN-09, TXN-10: what recurring transactions have still to come this period, and,
  // in the current one, what waits to be checked. Past periods have nothing coming.
  const coming =
    byDate && filters === 0 && period.end > today
      ? upcoming(recurrings, today, period.end).filter(
          (item) => (item.due && inPeriod(today, period)) || item.date >= period.start,
        )
      : []
  // The totals are a forecast: what is coming this period counts too, as the
  // transactions it will add.
  const forecast = coming
    .filter((item) => inPeriod(item.date, period))
    .map((item) => ({
      ...occurrenceFields(item.recurring, item.date, item.date),
      id: `${item.recurring.id}@${item.date}`,
    }))
  // TXN-11: a refund lowers expenses rather than adding to income.
  const refund = (transaction: Transaction) =>
    isRefund(transaction, lookups.categoryOf(transaction))
  const totals = flowTotals(
    [...inView, ...forecast],
    currencies,
    defaultCurrency,
    ledger.rates,
    refund,
  )

  const row = (transaction: Transaction) => (
    <TransactionRow
      key={transaction.id}
      transaction={transaction}
      wallets={wallets}
      taxonomy={lookups}
      defaultCurrency={defaultCurrency}
      showDate={!byDate}
      onOpen={(tapped) => {
        editor.open(opened(tapped))
      }}
      onDelete={(swiped) => {
        editor.remove(opened(swiped))
      }}
    />
  )

  // DL-NUM-03: a net that is money in shows its plus in Moss; one that is money out
  // reads like an expense, with no sign.
  const net = (minor: number) => {
    const value = { minor: Math.abs(minor), currency: defaultCurrency }
    return minor > 0 ? (
      <Amount
        parts={money.parts(value, 'always')}
        label={money.text(value, 'always')}
        tone="moss"
      />
    ) : (
      <Amount parts={money.parts(value)} label={money.text(value)} />
    )
  }

  return (
    <Page title={t('nav.transactions')} actions={actions}>
      {/* TXN-22: the period, with the ones before and after. */}
      <div className="flex items-center gap-1 rounded-2xl bg-surface p-1">
        <button
          type="button"
          aria-label={t('transactions.period.previous')}
          onClick={() => {
            setAnchor(shiftPeriod(anchor, scope, -1).start)
            setLimit(page)
          }}
          className="grid size-11 shrink-0 place-items-center rounded-xl text-brand focus-visible:outline-2 focus-visible:outline-brand"
        >
          <CaretLeftIcon aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setSheet('scope')
          }}
          className="flex min-h-11 flex-1 flex-col items-center justify-center rounded-xl py-1 focus-visible:outline-2 focus-visible:outline-brand"
        >
          <span className="flex items-center gap-1 text-[1.0625rem] font-semibold text-text">
            {periodName}
            <CaretDownIcon aria-hidden className="size-3.5 text-text-muted" />
          </span>
          <span className="text-[0.8125rem] text-text-muted">
            {coming.length > 0
              ? t('transactions.countUpcoming', {
                  count: inView.length,
                  upcoming: coming.length,
                })
              : t('transactions.count', { count: inView.length })}
          </span>
        </button>
        <button
          type="button"
          aria-label={t('transactions.period.next')}
          onClick={() => {
            setAnchor(shiftPeriod(anchor, scope, 1).start)
            setLimit(page)
          }}
          className="grid size-11 shrink-0 place-items-center rounded-xl text-brand focus-visible:outline-2 focus-visible:outline-brand"
        >
          <CaretRightIcon aria-hidden className="size-5" />
        </button>
      </div>

      {/* TXN-24: what came in, what went out and what's left, for what is shown and
          what is still to come in the period. */}
      <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-surface px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-text-muted">{t('transactions.totals.income')}</dt>
          <dd>
            {totals.income > 0 ? (
              net(totals.income)
            ) : (
              <Amount
                parts={money.parts({ minor: 0, currency: defaultCurrency })}
                label={money.text({ minor: 0, currency: defaultCurrency })}
              />
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-text-muted">{t('transactions.totals.expenses')}</dt>
          <dd>
            <Amount
              parts={money.parts({ minor: totals.expenses, currency: defaultCurrency })}
              label={money.text({ minor: totals.expenses, currency: defaultCurrency })}
            />
          </dd>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <dt className="text-xs text-text-muted">{t('transactions.totals.net')}</dt>
          <dd>{net(totals.net)}</dd>
        </div>
      </dl>

      {coming.length > 0 ? (
        <List label={t('recurring.upcoming')}>
          {coming.map((item) => (
            <RecurringRow
              key={`${item.recurring.id} ${item.date}`}
              recurring={item.recurring}
              detail={
                item.due
                  ? t('recurring.due', { date: formatShortDate(item.date, today, money.locale) })
                  : `${formatDay(item.date, today, money.locale, words)} · ${repeatLabel(t, item.recurring.every)}`
              }
              wallets={wallets}
              taxonomy={lookups}
              defaultCurrency={defaultCurrency}
              onOpen={() => {
                if (item.due) editor.openDue(item.recurring, item.date)
                else editor.openSeries(item.recurring)
              }}
            />
          ))}
          <ListLinkRow
            to="/transactions/recurring"
            title={t('recurring.title')}
            trailing={
              <span className="text-[0.9375rem] text-text-muted tabular-nums">
                {recurrings.length}
              </span>
            }
          />
        </List>
      ) : (
        recurrings.length > 0 &&
        inPeriod(today, period) && (
          <List>
            <ListLinkRow
              to="/transactions/recurring"
              title={t('recurring.title')}
              trailing={
                <span className="text-[0.9375rem] text-text-muted tabular-nums">
                  {recurrings.length}
                </span>
              }
            />
          </List>
        )
      )}

      {ordered.length === 0 && coming.length > 0 ? null : ordered.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-6 py-8 text-center">
          <p className="text-[0.9375rem] text-text-muted">
            {filters > 0
              ? t('transactions.noneFiltered')
              : t('transactions.noneInPeriod', { period: periodName })}
          </p>
          {filters > 0 && (
            <Button
              variant="secondary"
              className="px-6"
              onClick={() => {
                setFilter({})
              }}
            >
              {t('filters.clear')}
            </Button>
          )}
        </section>
      ) : byDate ? (
        byDay(shown).map((day) => {
          const dayNet = flowTotals(
            day.transactions,
            currencies,
            defaultCurrency,
            ledger.rates,
            refund,
          ).net
          return (
            <List
              key={day.date}
              label={formatDay(day.date, today, money.locale, words)}
              {...(dayNet !== 0 ? { detail: net(dayNet) } : {})}
            >
              {day.transactions.map(row)}
            </List>
          )
        })
      ) : (
        <List>{shown.map(row)}</List>
      )}
      {ordered.length > limit && (
        <Button
          variant="ghost"
          onClick={() => {
            setLimit(limit + page)
          }}
        >
          {t('transactions.showMore')}
        </Button>
      )}

      <Sheet
        open={sheet === 'scope'}
        title={t('transactions.period.title')}
        doneLabel={t('nav.done')}
        onClose={() => {
          setSheet(null)
        }}
      >
        <List inset>
          {scopes.map((option) => (
            <ChoiceRow
              key={option}
              role="radio"
              title={t(`transactions.period.scopes.${option}`)}
              checked={scope === option}
              onToggle={() => {
                setScope(option)
                setSheet(null)
                setLimit(page)
              }}
            />
          ))}
        </List>
        {!inPeriod(today, period) && (
          <Button
            variant="secondary"
            onClick={() => {
              setAnchor(today)
              setSheet(null)
              setLimit(page)
            }}
          >
            {t('transactions.period.current')}
          </Button>
        )}
      </Sheet>
      <SortSheet
        open={sheet === 'sort'}
        value={sort}
        onChange={setSort}
        onClose={() => {
          setSheet(null)
        }}
      />
      <FilterSheet
        open={sheet === 'filter'}
        ledger={ledger}
        value={filter}
        onChange={(next) => {
          setFilter(next)
          setLimit(page)
        }}
        onClose={() => {
          setSheet(null)
        }}
      />
      {editor.sheet}
    </Page>
  )
}
