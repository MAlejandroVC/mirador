import type { CategoryChange } from '@repo/core'
import { Link } from '@tanstack/react-router'
import { List } from '../../components/ui/list'
import { formatShare } from '../../lib/format'
import { useMediaQuery } from '../../lib/use-media-query'
import { Sparkline } from '../analysis/charts'
import type { BudgetWords } from '../budget/budget-words'
import { ProgressBar } from '../budget/parts'
import { GoalRow } from '../budget/plan-view'
import { CategoryTile } from '../categories/category-tile'
import { TransactionRow } from '../transactions/transaction-row'
import { useTransactionEditor } from '../transactions/use-transaction-editor'
import { cardLinkClass, HomeSection, MoreRow } from './parts'
import type { Home } from './use-home'

// The cards under Home's lists, each opening the screen that has it in full (DSH-08).

/** DSH-03: how many goals Home shows; the rest are on Budget. */
const goalsShown = 3

/** DSH-03, BUD-23: the first goals in their order, each with its bar and how it is going. */
export function GoalsCard({ home, words }: { home: Home; words: BudgetWords }) {
  const { t } = words
  const { budget } = home
  const open = budget.goals.filter((goal) => goal.done === undefined && !goal.paused)
  if (open.length === 0) return null
  return (
    <List label={t('budget.goals.title')}>
      {open.slice(0, goalsShown).map((goal) => (
        <GoalRow
          key={goal.id}
          budget={budget}
          goal={goal}
          plan={budget.funding.goals.find((item) => item.goal.id === goal.id)}
          words={words}
        />
      ))}
      {open.length > goalsShown && (
        <MoreRow to="/budget">{t('home.goals.seeAll', { count: open.length })}</MoreRow>
      )}
    </List>
  )
}

/**
 * DSH-04, ANA-16: net worth today and how it moved since last month, with the shape of
 * the last six months, and what the person owes beside it. The line is a small one to
 * glance at, so it has no callouts; Wallets has the rest.
 */
export function WorthCard({ home, words }: { home: Home; words: BudgetWords }) {
  const { t } = words
  const { worth, budget } = home
  const now = worth.at(-1)
  const before = worth.at(-2)
  if (!now) return null
  // Before the first month with a balance there is nothing to compare with.
  const history = worth.filter((point) => point.have !== 0 || point.owe !== 0)
  const compare = before && history.length > 1 ? before : null
  const month = compare ? words.monthName(compare.period) : ''
  const change = compare ? now.netWorth - compare.netWorth : 0
  const wallets = budget.ledger.wallets.filter((wallet) => wallet.active).length
  const owing = now.owe > 0 || (compare?.owe ?? 0) > 0

  return (
    <HomeSection label={t('home.worth.title')}>
      <Link to="/wallets" className={cardLinkClass}>
        <span className="flex items-end justify-between gap-3 px-4 pt-3.5 pb-3">
          <span className="flex min-w-0 flex-col gap-1">
            {words.figure(now.netWorth)}
            <span className="text-[0.8125rem] text-text-muted">
              {compare
                ? change === 0
                  ? t('home.worth.same', { month })
                  : t(change > 0 ? 'home.worth.up' : 'home.worth.down', {
                      amount: words.text(Math.abs(change)),
                      month,
                    })
                : t('home.worth.across', { count: wallets })}
            </span>
          </span>
          {history.length > 1 && (
            <span className="w-[5.5rem] shrink-0 pb-1">
              <Sparkline values={history.map((point) => point.netWorth)} />
            </span>
          )}
        </span>
        {owing && (
          <span className="flex min-h-[3.25rem] items-center gap-2 border-t-[0.5px] border-separator py-2 pr-4 ml-4">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[0.9375rem] text-text">{t('home.worth.owe')}</span>
              {compare && (
                <span className="text-[0.8125rem] text-text-muted">
                  {now.owe === compare.owe
                    ? t('home.worth.same', { month })
                    : t(now.owe < compare.owe ? 'home.worth.oweLess' : 'home.worth.oweMore', {
                        amount: words.text(Math.abs(now.owe - compare.owe)),
                        month,
                      })}
                </span>
              )}
            </span>
            {words.amount(now.owe)}
          </span>
        )}
      </Link>
    </HomeSection>
  )
}

/**
 * ANA-12, ANA-30: the categories that moved most against their usual month so far,
 * like Apple Health's highlights: a sentence, then this month and the usual one as two
 * bars, in the category's color (DL-COL-13). Each opens the category's own screen.
 */
export function HighlightsCard({ home, words }: { home: Home; words: BudgetWords }) {
  const { t } = words
  if (home.highlights.length === 0) return null
  return (
    <HomeSection label={t('home.highlights.title')}>
      <div className="flex flex-col gap-3">
        {home.highlights.map((item) => (
          <Highlight key={item.categoryId} item={item} home={home} words={words} />
        ))}
      </div>
    </HomeSection>
  )
}

function Highlight({
  item,
  home,
  words,
}: {
  item: CategoryChange
  home: Home
  words: BudgetWords
}) {
  const { t } = words
  const { budget } = home
  const category = budget.lookups.categories.get(item.categoryId)
  if (!category) return null
  const group = budget.lookups.groupOf(category)
  const top = Math.max(item.current, item.usual, 1)
  const percent = formatShare(Math.abs(item.ratio ?? 0), words.locale)
  const values = { name: category.name, percent, date: words.day(budget.today) }
  return (
    <Link
      to="/budget/$by/$id"
      params={{ by: 'category', id: item.categoryId }}
      className={`${cardLinkClass} flex flex-col gap-2.5 px-4 pt-3.5 pb-4`}
    >
      <span className="flex items-center gap-2.5 text-[0.8125rem] font-semibold text-text-muted">
        <CategoryTile category={category} group={group} />
        {category.name}
      </span>
      <span className="text-[1.0625rem] leading-snug font-semibold text-text">
        {t(item.current > item.usual ? 'home.highlights.more' : 'home.highlights.less', values)}
      </span>
      {/* DL-VIZ-01: this month in its color, the usual month in `text-faint`. */}
      <span className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 text-[0.8125rem]">
        <span className="text-text-muted">{words.monthTitle(budget.view.period)}</span>
        <ProgressBar value={item.current / top} color={group?.color ?? 'stone'} />
        <span className="text-right text-text tabular-nums">{words.text(item.current)}</span>
        <span className="text-text-muted">{t('home.highlights.usual')}</span>
        <ProgressBar value={item.usual / top} color="other" />
        <span className="text-right text-text-muted tabular-nums">{words.text(item.usual)}</span>
      </span>
    </Link>
  )
}

/**
 * DSH-06: the newest transactions, five on a phone and ten from a tablet up, each
 * opening its sheet as in Transactions.
 */
export function LatestCard({ home, words }: { home: Home; words: BudgetWords }) {
  const { t } = words
  const { ledger, lookups } = home.budget
  const editor = useTransactionEditor()
  const wide = useMediaQuery('(min-width: 768px)')
  const purchases = new Map(ledger.transactions.map((transaction) => [transaction.id, transaction]))
  const wallets = new Map(ledger.wallets.map((wallet) => [wallet.id, wallet]))
  if (home.latest.length === 0) return null
  return (
    <>
      <List label={t('home.latest.title')}>
        {home.latest.slice(0, wide ? 10 : 5).map((transaction) => (
          <TransactionRow
            key={`${transaction.id} ${transaction.date}`}
            transaction={transaction}
            wallets={wallets}
            taxonomy={lookups}
            defaultCurrency={ledger.defaultCurrency}
            showDate
            onOpen={(tapped) => {
              // An installment opens the purchase it is part of (TXN-32).
              const part = transaction.part
              editor.open((part && purchases.get(part.purchaseId)) ?? tapped)
            }}
            onDelete={(tapped) => {
              const part = transaction.part
              editor.remove((part && purchases.get(part.purchaseId)) ?? tapped)
            }}
          />
        ))}
        <MoreRow to="/transactions">{t('wallets.transactions.seeMore')}</MoreRow>
      </List>
      {editor.sheet}
    </>
  )
}
