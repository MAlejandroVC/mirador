import { type Coming, daysBetween, type Money } from '@repo/core'
import { Amount } from '../../components/ui/amount'
import { DateTile } from '../../components/ui/date-tile'
import { List, ListLinkRow, RowBody } from '../../components/ui/list'
import { rowClass } from '../../components/ui/row'
import { useMoney } from '../../lib/format'
import type { BudgetWords } from '../budget/budget-words'
import { useTransactionEditor } from '../transactions/use-transaction-editor'
import { MoreRow, NoteRow } from './parts'
import { recurringName, sentence } from './text'
import type { Home } from './use-home'

/**
 * DSH-11: what happens on its own in the next two weeks, soonest first, each on its
 * date's tile (DL-CMP-16). None of it has happened, so amounts are muted, and income
 * keeps its plus in Moss (DL-NUM-03). A recurring transaction or an installment opens
 * its sheet; a fee or a card payment opens its wallet (DSH-08).
 */
export function ComingList({ home, words }: { home: Home; words: BudgetWords }) {
  const { t } = words
  const editor = useTransactionEditor()
  const { coming, totals } = home
  const money = useMoney(home.budget.context.currency)
  // DL-NUM-03: what comes in keeps its plus, in Moss, inside the sentence too.
  const plus = (minor: number) => (
    <span className="text-moss">
      {money.text({ minor, currency: home.budget.context.currency }, 'always')}
    </span>
  )
  const lead = (values: Record<string, string>) =>
    totals.out > 0 && totals.in > 0
      ? t('home.coming.totals', values)
      : totals.out > 0
        ? t('home.coming.totalsOut', values)
        : t('home.coming.totalsIn', values)

  return (
    <>
      <List label={t('home.coming.title')}>
        {coming.length === 0 && <NoteRow>{t('home.coming.none')}</NoteRow>}
        {coming.map((item) => (
          <ComingRow
            key={`${item.kind} ${keyOf(item)} ${item.date}`}
            item={item}
            home={home}
            words={words}
            editor={editor}
          />
        ))}
        {(totals.out > 0 || totals.in > 0) && (
          <NoteRow>
            {sentence(lead, {
              out: words.text(totals.out),
              in: plus(totals.in),
            })}
          </NoteRow>
        )}
        {/* ANA-27: the months ahead in full. */}
        <MoreRow to="/budget/coming">{t('home.coming.seeAll')}</MoreRow>
      </List>
      {editor.sheet}
    </>
  )
}

function keyOf(item: Coming) {
  switch (item.kind) {
    case 'recurring':
      return item.recurring.id
    case 'installment':
      return item.part.id
    case 'fee':
      return `${item.walletId} ${item.fee.id}`
    case 'card':
      return item.walletId
  }
}

function ComingRow({
  item,
  home,
  words,
  editor,
}: {
  item: Coming
  home: Home
  words: BudgetWords
  editor: ReturnType<typeof useTransactionEditor>
}) {
  const { t } = words
  const { ledger, lookups, today } = home.budget
  const money = useMoney(ledger.defaultCurrency)
  const wallets = new Map(ledger.wallets.map((wallet) => [wallet.id, wallet]))
  const walletName = (id: string) => wallets.get(id)?.name ?? ''
  const currency = (id: string) => wallets.get(id)?.currency ?? ledger.defaultCurrency
  const [, month = 1, day = 1] = item.date.split('-').map(Number)
  const tile = (
    <DateTile
      month={new Intl.DateTimeFormat(words.locale, { month: 'short', timeZone: 'UTC' })
        .format(new Date(Date.UTC(2000, month - 1, 1)))
        .replace('.', '')}
      day={String(day)}
    />
  )
  // The tile has the date; within the week, the line under the title says the weekday.
  const weekday =
    daysBetween(today, item.date) < 7
      ? new Intl.DateTimeFormat(words.locale, { weekday: 'long', timeZone: 'UTC' }).format(
          new Date(`${item.date}T00:00:00Z`),
        )
      : null
  const details = (...parts: (string | null | undefined)[]) =>
    [
      weekday ? weekday.charAt(0).toLocaleUpperCase(words.locale) + weekday.slice(1) : null,
      ...parts,
    ]
      .filter((part) => part !== null && part !== undefined && part !== '')
      .join(' · ')
  const amount = (value: Money, income: boolean) => {
    const signs = income ? 'always' : 'negative'
    return (
      <Amount
        parts={money.parts(value, signs)}
        label={money.text(value, signs)}
        tone={income ? 'moss' : 'muted'}
      />
    )
  }

  switch (item.kind) {
    case 'recurring': {
      const { recurring } = item
      const transfer = recurring.kind === 'transfer'
      const title = transfer
        ? t('transactions.between', {
            from: walletName(recurring.walletId),
            to: walletName(recurring.toWalletId ?? ''),
          })
        : recurringName(recurring, lookups, t)
      const category = transfer ? null : lookups.categoryOf(recurring)
      return (
        <SheetRow
          leading={tile}
          title={title}
          subtitle={details(
            category && category.name !== title ? category.name : null,
            transfer ? null : walletName(recurring.walletId),
          )}
          trailing={amount(
            { minor: Math.abs(recurring.amount), currency: currency(recurring.walletId) },
            recurring.kind === 'income',
          )}
          onClick={() => {
            editor.openSeries(recurring)
          }}
        />
      )
    }
    case 'installment': {
      const { part } = item
      const purchase = ledger.transactions.find(
        (transaction) => transaction.id === part.part?.purchaseId,
      )
      const payee = part.payeeId === undefined ? undefined : lookups.payees.get(part.payeeId)
      const note = part.note?.trim()
      const title =
        payee?.name ??
        (note === undefined || note === '' ? undefined : note) ??
        lookups.categoryOf(part)?.name ??
        t('transactions.types.expense')
      return (
        <SheetRow
          leading={tile}
          title={title}
          subtitle={details(
            part.part
              ? t('home.coming.part', { number: part.part.number, of: part.part.of })
              : null,
            walletName(part.walletId),
          )}
          trailing={amount(
            { minor: Math.abs(part.amount), currency: currency(part.walletId) },
            part.amount > 0,
          )}
          onClick={() => {
            editor.open(purchase ?? part)
          }}
        />
      )
    }
    case 'fee':
      return (
        <ListLinkRow
          to="/wallets/$walletId"
          params={{ walletId: item.walletId }}
          leading={tile}
          title={item.fee.name}
          subtitle={details(walletName(item.walletId))}
          trailing={amount({ minor: item.fee.amount, currency: currency(item.walletId) }, false)}
        />
      )
    case 'card':
      return (
        <ListLinkRow
          to="/wallets/$walletId"
          params={{ walletId: item.walletId }}
          leading={tile}
          title={t('home.attention.pay', { name: walletName(item.walletId) })}
          subtitle={details(t('wallets.credit.statement'))}
          trailing={amount({ minor: item.amount, currency: currency(item.walletId) }, false)}
        />
      )
  }
}

/** DL-CMP-07: a row that opens a sheet, so it has no chevron. */
function SheetRow({ onClick, ...props }: Parameters<typeof RowBody>[0] & { onClick: () => void }) {
  return (
    <li className="group">
      <button type="button" onClick={onClick} className={rowClass}>
        <RowBody {...props} />
      </button>
    </li>
  )
}
