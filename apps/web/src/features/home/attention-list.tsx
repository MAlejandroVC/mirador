import { type Attention, daysBetween } from '@repo/core'
import { useState } from 'react'
import { Amount } from '../../components/ui/amount'
import { IconTile } from '../../components/ui/icon-tile'
import {
  ArrowsClockwiseIcon,
  CalendarCheckIcon,
  CalendarDotsIcon,
  CheckCircleIcon,
  ScalesIcon,
  TagIcon,
  UploadSimpleIcon,
} from '../../components/ui/icons'
import { List, ListLinkRow, ListRow } from '../../components/ui/list'
import { ShowMoreRow } from '../../components/ui/show-more-row'
import { useMoney } from '../../lib/format'
import { CategoryTile } from '../categories/category-tile'
import type { BudgetWords } from '../budget/budget-words'
import { lineLook, lineName } from '../budget/lines'
import { Over } from '../budget/parts'
import { periodOf } from '../budget/use-budget'
import { walletIconComponents } from '../wallets/wallet-look'
import type { LedgerWallet } from '../wallets/use-ledger'
import { recurringName, sentence } from './text'
import type { Home } from './use-home'

// DL-CMP-15: the first few, then the rest a tap away.
const shownFirst = 5

/**
 * DSH-05, DSH-08, BUD-45: what needs a tap from the person, most urgent first, each
 * opening the screen where it is done. With nothing to do it says so, calmly.
 */
export function AttentionList({ home, words }: { home: Home; words: BudgetWords }) {
  const { t } = words
  const [open, setOpen] = useState(false)
  const { attention } = home
  const label = t('home.attention.title')

  if (attention.length === 0)
    return (
      <List label={label}>
        <ListRow
          leading={<IconTile icon={CheckCircleIcon} />}
          title={t('home.attention.none')}
          subtitle={t('home.attention.noneBody')}
        />
      </List>
    )

  const rest = attention.length - shownFirst
  return (
    <List label={label}>
      {attention.map((item, index) =>
        index < shownFirst || open ? (
          <AttentionRow key={keyOf(item)} item={item} home={home} words={words} />
        ) : null,
      )}
      {rest > 0 && (
        <ShowMoreRow
          open={open}
          more={t('home.attention.showAll', { count: attention.length })}
          less={t('home.attention.showFewer')}
          separator
          onToggle={() => {
            setOpen(!open)
          }}
        />
      )}
    </List>
  )
}

function keyOf(item: Attention) {
  switch (item.kind) {
    case 'card':
      return `card ${item.walletId}`
    case 'over':
    case 'atRisk':
      return `${item.kind} ${item.line}`
    case 'fee':
      return `fee ${item.walletId} ${item.fee.id} ${item.date}`
    default:
      return item.kind
  }
}

function WalletTile({ wallet }: { wallet: LedgerWallet | undefined }) {
  if (!wallet) return <IconTile icon={ScalesIcon} />
  return <IconTile icon={walletIconComponents[wallet.icon]} color={wallet.color} />
}

function AttentionRow({ item, home, words }: { item: Attention; home: Home; words: BudgetWords }) {
  const { t } = words
  const { budget } = home
  const { ledger, lookups, today } = budget
  const money = useMoney(ledger.defaultCurrency)
  const wallet = (id: string) => ledger.wallets.find((each) => each.id === id)
  const inWallet = (minor: number, walletId: string) => {
    const value = { minor, currency: wallet(walletId)?.currency ?? ledger.defaultCurrency }
    return <Amount parts={money.parts(value)} label={money.text(value)} />
  }
  const list = (names: string[]) =>
    new Intl.ListFormat(words.locale, { type: 'conjunction' }).format(names)

  switch (item.kind) {
    case 'card':
      return (
        <ListLinkRow
          to="/wallets/$walletId"
          params={{ walletId: item.walletId }}
          leading={<WalletTile wallet={wallet(item.walletId)} />}
          title={t('home.attention.pay', { name: wallet(item.walletId)?.name ?? '' })}
          subtitle={
            item.due < today
              ? t('wallets.credit.statementPast', { date: words.day(item.due) })
              : item.due === today
                ? t('home.attention.dueToday')
                : t('home.attention.due', { date: words.day(item.due) })
          }
          trailing={inWallet(item.amount, item.walletId)}
        />
      )
    case 'over':
    case 'atRisk': {
      const look = lineLook(budget, item.line)
      const over = <Over>{t('budget.lines.over', { amount: words.text(item.amount) })}</Over>
      return (
        <ListLinkRow
          to="/budget/line/$line"
          params={{ line: item.line }}
          leading={
            look.category ? <CategoryTile category={look.category} group={look.group} /> : null
          }
          title={t(item.kind === 'over' ? 'home.attention.over' : 'home.attention.atRisk', {
            name: lineName(budget, item.line),
          })}
          subtitle={
            item.kind === 'over' ? (
              <>
                {over}
                {` · ${t('budget.hero.days', { count: daysBetween(today, item.end) + 1 })}`}
              </>
            ) : (
              // BUD-45: "At this pace, $480 over by Oct 31".
              sentence((values) => t('home.attention.pace', values), {
                amount: over,
                date: words.day(item.end),
              })
            )
          }
        />
      )
    }
    case 'confirm': {
      // TXN-10: one waiting says which it is; several, their names.
      const [first] = item.items
      return (
        <ListLinkRow
          to="/transactions"
          leading={<IconTile icon={ArrowsClockwiseIcon} />}
          title={
            item.items.length === 1 && first
              ? t('home.attention.confirmOne', {
                  name: recurringName(first.recurring, lookups, t),
                })
              : t('home.attention.confirm', { count: item.items.length })
          }
          subtitle={
            item.items.length === 1 && first
              ? t('home.attention.due', { date: words.day(first.date) })
              : list(item.items.map((due) => recurringName(due.recurring, lookups, t)))
          }
        />
      )
    }
    case 'fee':
      return (
        <ListLinkRow
          to="/wallets/$walletId"
          params={{ walletId: item.walletId }}
          leading={<WalletTile wallet={wallet(item.walletId)} />}
          title={t('home.attention.confirmOne', { name: item.fee.name })}
          subtitle={`${wallet(item.walletId)?.name ?? ''} · ${t('home.attention.due', { date: words.day(item.date) })}`}
          trailing={inWallet(item.fee.amount, item.walletId)}
        />
      )
    case 'review':
      return (
        <ListLinkRow
          to="/budget/review"
          leading={<IconTile icon={CalendarCheckIcon} />}
          title={t('budget.reviewCard.title', { month: words.monthTitle(item.period) })}
          subtitle={t('budget.reviewCard.body', { month: words.monthName(budget.view.period) })}
        />
      )
    case 'budget':
      return (
        <ListLinkRow
          to="/budget"
          leading={<IconTile icon={CalendarDotsIcon} />}
          title={t('home.attention.make', {
            month: words.monthName(periodOf(budget, item.start)),
          })}
          subtitle={t('home.attention.makeBody')}
        />
      )
    case 'nextBudget': {
      const period = periodOf(budget, item.start)
      return (
        <ListLinkRow
          to="/budget"
          search={{ month: item.start }}
          leading={<IconTile icon={CalendarDotsIcon} />}
          title={t('home.attention.lock', { month: words.monthName(period) })}
          subtitle={t('budget.nudge.title', { month: words.monthTitle(period), count: item.days })}
        />
      )
    }
    case 'categorize':
      return (
        <ListLinkRow
          to="/transactions"
          search={{
            scope: 'year',
            ...(home.uncategorizedId ? { category: home.uncategorizedId } : {}),
          }}
          leading={<IconTile icon={TagIcon} />}
          title={t('home.attention.categorize', { count: item.count })}
          subtitle={t('home.attention.categorizeBody')}
        />
      )
    case 'imports':
      return (
        <ListLinkRow
          to="/settings/data"
          leading={<IconTile icon={UploadSimpleIcon} />}
          title={t('home.attention.imports', { count: item.count })}
          subtitle={t('home.attention.importsBody')}
        />
      )
    case 'balance': {
      const [only] = item.checks
      if (item.checks.length === 1 && only)
        return (
          <ListLinkRow
            to="/wallets/$walletId"
            params={{ walletId: only.walletId }}
            leading={<WalletTile wallet={wallet(only.walletId)} />}
            title={t('home.attention.check', { name: wallet(only.walletId)?.name ?? '' })}
            subtitle={t('home.attention.checked', { date: words.day(only.since) })}
          />
        )
      return (
        <ListLinkRow
          to="/wallets"
          leading={<IconTile icon={ScalesIcon} />}
          title={t('home.attention.checkMany', { count: item.checks.length })}
          subtitle={list(item.checks.map((check) => wallet(check.walletId)?.name ?? ''))}
        />
      )
    }
  }
}
