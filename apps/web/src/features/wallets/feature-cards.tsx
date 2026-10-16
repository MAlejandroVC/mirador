import {
  cardStatement,
  changeTo,
  dueFees,
  type Fee,
  handleFee,
  interestForPeriod,
  loanProjection,
  monthOf,
  nextFeeDate,
  type Transaction,
  valuationSummary,
} from '@repo/core'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Amount } from '../../components/ui/amount'
import { Button } from '../../components/ui/button'
import { PlusIcon } from '../../components/ui/icons'
import { formatDay, formatPercent, formatShare, formatShortDate, useMoney } from '../../lib/format'
import { markNew } from '../../lib/motion'
import {
  type LedgerWallet,
  newId,
  transactionBody,
  useSaveRecords,
  walletChange,
} from './use-ledger'

// WAL-13 to WAL-18: one card per feature switched on, under the balance, each with the
// answer the feature exists for, in words (DL-PRI-07): what the savings earn, what the
// card costs and when to pay it, when the loan ends, what the investment gained, and
// which fees to confirm. A feature not set up yet says what it would show and offers
// Set up. Details are entered here, next to their result, so adding a wallet stays a
// name and a balance (WAL-02).

export type FeatureSheet = 'interest' | 'credit' | 'loan' | { fee: Fee | null }

interface CardProps {
  wallet: LedgerWallet
  balance: number
  today: string
  defaultCurrency: string
  onEdit: (sheet: FeatureSheet) => void
}

function FeatureCard({
  title,
  editLabel,
  onEdit,
  children,
}: {
  title: string
  editLabel?: string
  onEdit?: () => void
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-surface px-4 pt-3 pb-4">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 className="text-[0.8125rem] text-text-muted">{title}</h2>
        {onEdit && editLabel && (
          <button
            type="button"
            onClick={onEdit}
            className="-mr-2 min-h-11 rounded-xl px-2 text-[0.9375rem] text-brand focus-visible:outline-2 focus-visible:outline-brand"
          >
            {editLabel}
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

/** One plain line of the card, muted unless it is the card's answer. */
function Line({
  children,
  strong,
  warning,
}: {
  children: ReactNode
  strong?: boolean
  warning?: boolean
}) {
  return (
    <p
      className={`text-[0.9375rem] ${warning ? 'text-warning' : strong ? 'text-text' : 'text-text-muted'}`}
    >
      {children}
    </p>
  )
}

function SetUp({ body, label, onClick }: { body: string; label: string; onClick: () => void }) {
  return (
    <>
      <Line>{body}</Line>
      <Button variant="secondary" onClick={onClick}>
        {label}
      </Button>
    </>
  )
}

/** A label at the left and its value at the right, as in a Settings row. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[0.9375rem]">
      <span className="text-text-muted">{label}</span>
      <span className="text-text tabular-nums">{children}</span>
    </div>
  )
}

function useWords() {
  const { t } = useTranslation()
  return { today: t('dates.today'), yesterday: t('dates.yesterday') }
}

/**
 * WAL-16, WAL-25: how much of the limit is used, split the way the statement splits
 * it: what to pay by the due date to avoid interest, what was charged since, the
 * installments still to come (TXN-30) and what is left to spend. One bar shows the
 * parts in the wallet's color, from strongest to faintest (DL-VIZ-01), with a row for
 * each under it, and Pay the card opens a transfer for the statement balance.
 */
export function CreditLimitCard({
  wallet,
  today,
  defaultCurrency,
  onEdit,
  transactions,
  onPay,
}: CardProps & { transactions: readonly Transaction[]; onPay: (amount: number) => void }) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  const edit = () => {
    onEdit('credit')
  }
  if (!wallet.credit)
    return (
      <FeatureCard title={t('wallets.credit.title')}>
        <SetUp
          body={t('wallets.credit.empty')}
          label={t('wallets.features.setUp')}
          onClick={edit}
        />
      </FeatureCard>
    )
  const limit = wallet.credit.limit
  const card = cardStatement(wallet.id, transactions, wallet.credit, today)
  const of = (minor: number) => money.text({ minor, currency: wallet.currency })
  const day = (date: string) => formatShortDate(date, today, money.locale)
  const used = Math.max(0, card.owed)
  const utilization = limit > 0 ? used / limit : 0
  const over = card.available < 0
  // The same color, fainter for what is further from being paid.
  const shade = (strength: number) =>
    `color-mix(in srgb, var(--mirador-${wallet.color}) calc(var(--mirador-bar-mix) * ${String(strength)}), var(--mirador-surface))`
  const parts = [
    {
      key: 'statement',
      amount: card.statement,
      color: shade(1),
      title: t('wallets.credit.statement'),
      hint:
        card.statement === 0
          ? t('wallets.credit.statementPaid')
          : card.due < today
            ? t('wallets.credit.statementPast', { date: day(card.due) })
            : t('wallets.credit.statementHint', { date: day(card.due) }),
      always: true,
    },
    {
      key: 'since',
      amount: card.since,
      color: shade(0.6),
      title: t('wallets.credit.since'),
      hint: t('wallets.credit.sinceHint', { date: day(card.nextClosing) }),
      always: false,
    },
    {
      key: 'unbilled',
      amount: card.unbilled,
      color: shade(0.3),
      title: t('wallets.credit.unbilled'),
      hint: t('wallets.credit.unbilledHint'),
      always: false,
    },
  ]
  // DL-NUM-02: amounts in rows have their cents small, like every list.
  const amount = (minor: number) => {
    const value = { minor, currency: wallet.currency }
    return <Amount parts={money.parts(value)} label={money.text(value)} />
  }
  const toPay = card.statement > 0 ? card.statement : card.statement + card.since
  return (
    <FeatureCard title={t('wallets.credit.title')} editLabel={t('wallets.edit')} onEdit={edit}>
      <div
        role="meter"
        aria-label={t('wallets.credit.utilization')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(1, utilization) * 100)}
        className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-fill"
      >
        {parts.map(
          (part) =>
            part.amount > 0 && (
              <div
                key={part.key}
                className="h-full"
                style={{
                  width: `${String((part.amount / Math.max(used, limit)) * 100)}%`,
                  backgroundColor: part.color,
                }}
              />
            ),
        )}
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <Line strong>{t('wallets.credit.used', { used: of(used), limit: of(limit) })}</Line>
        <span className="text-[0.9375rem] text-text-muted tabular-nums">
          {formatShare(utilization, money.locale)}
        </span>
      </div>
      <ul className="flex flex-col">
        {parts.map(
          (part) =>
            (part.always || part.amount > 0) && (
              <CreditPart
                key={part.key}
                color={part.color}
                title={part.title}
                hint={part.hint}
                amount={amount(part.amount)}
              />
            ),
        )}
        {/* DL-COL-05: over the limit changes only the words' color, never the bar's. */}
        <CreditPart
          title={over ? t('wallets.credit.overRow') : t('wallets.credit.availableRow')}
          hint={over ? null : t('wallets.credit.availableHint')}
          amount={
            over ? (
              <span className="text-[0.9375rem] text-warning tabular-nums">
                {of(-card.available)}
              </span>
            ) : (
              amount(card.available)
            )
          }
          warning={over}
        />
      </ul>
      {toPay > 0 && (
        <Button
          variant="secondary"
          onClick={() => {
            onPay(toPay)
          }}
        >
          {t('wallets.credit.pay')}
        </Button>
      )}
    </FeatureCard>
  )
}

/** WAL-25: one part of what the card owes: its dot, its name, what it means and how much. */
function CreditPart({
  color,
  title,
  hint,
  amount,
  warning,
}: {
  color?: string
  title: string
  hint: string | null
  amount: ReactNode
  warning?: boolean
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className={`size-2.5 shrink-0 rounded-full ${color ? '' : 'bg-fill'}`}
        style={color ? { backgroundColor: color } : undefined}
      />
      {/* DL-SHP-04: the hairline starts where the text starts. */}
      <span className="flex min-h-[3.25rem] min-w-0 flex-1 items-center gap-3 border-t-[0.5px] border-separator py-2">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`text-[0.9375rem] ${warning ? 'text-warning' : 'text-text'}`}>
            {title}
          </span>
          {hint && <span className="text-[0.8125rem] text-text-muted">{hint}</span>}
        </span>
        {amount}
      </span>
    </li>
  )
}

/** WAL-17: when the loan is paid off and the interest still to pay. */
export function LoanCard({ wallet, balance, today, defaultCurrency, onEdit }: CardProps) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  const edit = () => {
    onEdit('loan')
  }
  if (!wallet.loan)
    return (
      <FeatureCard title={t('wallets.loan.title')}>
        <SetUp body={t('wallets.loan.empty')} label={t('wallets.features.setUp')} onClick={edit} />
      </FeatureCard>
    )
  const interest = wallet.features.includes('interest') ? wallet.interest : undefined
  const projection = loanProjection(balance, wallet.loan, interest, today)
  const of = (minor: number) => money.text({ minor, currency: wallet.currency })
  const month = (date: string) =>
    new Intl.DateTimeFormat(money.locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`))
  return (
    <FeatureCard title={t('wallets.loan.title')} editLabel={t('wallets.edit')} onEdit={edit}>
      {projection.kind === 'paidOff' && <Line strong>{t('wallets.loan.paidOff')}</Line>}
      {projection.kind === 'never' && (
        <Line warning>
          {t('wallets.loan.never', {
            payment: of(wallet.loan.payment),
            interest: of(projection.monthlyInterest),
          })}
        </Line>
      )}
      {projection.kind === 'onTrack' && (
        <>
          <p className="text-[1.25rem] font-semibold text-text">
            {t('wallets.loan.payoff', { date: month(projection.payoffDate) })}
          </p>
          <Line>
            {t('wallets.loan.left', {
              count: projection.paymentsLeft,
              payment: of(wallet.loan.payment),
            })}
          </Line>
          <div className="mt-1 flex flex-col gap-1.5 border-t border-separator pt-3">
            <Fact label={t('wallets.loan.interestLeft')}>{of(projection.interestLeft)}</Fact>
            <Fact label={t('wallets.loan.contractInterest')}>
              {of(projection.contractInterest)}
            </Fact>
          </div>
        </>
      )}
      {!interest && <Line>{t('wallets.loan.noRate')}</Line>}
    </FeatureCard>
  )
}

/** WAL-13, WAL-14: what the balance earns or costs this month, and posting it. */
export function InterestCard({
  wallet,
  balance,
  today,
  defaultCurrency,
  transactions,
  onEdit,
  onRecord,
}: CardProps & { transactions: readonly Transaction[]; onRecord: (amount: number) => void }) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  const edit = () => {
    onEdit('interest')
  }
  if (!wallet.interest)
    return (
      <FeatureCard title={t('wallets.interest.title')}>
        <SetUp
          body={t('wallets.interest.empty')}
          label={t('wallets.features.setUp')}
          onClick={edit}
        />
      </FeatureCard>
    )
  const period = monthOf(today)
  const estimate = interestForPeriod(balance, wallet.interest, period)
  const recorded = transactions
    .filter((tx) => tx.kind === 'interest' && tx.date >= period.start && tx.date <= period.end)
    .reduce((sum, tx) => sum + tx.amount, 0)
  const recordedAny = transactions.some(
    (tx) => tx.kind === 'interest' && tx.date >= period.start && tx.date <= period.end,
  )
  const value = { minor: Math.abs(estimate), currency: wallet.currency }
  const rate = formatPercent(wallet.interest.rate, money.locale)
  const how =
    wallet.interest.type === 'effective'
      ? t('wallets.interest.describe.effective', { rate })
      : t(`wallets.interest.describe.${wallet.interest.compounding}`, { rate })
  return (
    <FeatureCard title={t('wallets.interest.title')} editLabel={t('wallets.edit')} onEdit={edit}>
      <p className="flex items-baseline gap-1.5 text-[0.9375rem] text-text">
        <span>{estimate >= 0 ? t('wallets.interest.earns') : t('wallets.interest.costs')}</span>
        <Amount parts={money.parts(value)} label={money.text(value)} />
        <span>{t('wallets.interest.thisMonth')}</span>
      </p>
      <Line>{how}</Line>
      {recordedAny ? (
        <Line>
          {t('wallets.interest.recorded', {
            amount: money.text({ minor: recorded, currency: wallet.currency }, 'always'),
          })}
        </Line>
      ) : (
        estimate !== 0 && (
          <Button
            variant="secondary"
            onClick={() => {
              onRecord(estimate)
            }}
          >
            {t('wallets.interest.record')}
          </Button>
        )
      )}
    </FeatureCard>
  )
}

/** WAL-18: what went in and what the market added. */
export function ValuationCard({
  wallet,
  defaultCurrency,
  transactions,
}: Pick<CardProps, 'wallet' | 'defaultCurrency'> & { transactions: readonly Transaction[] }) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  // A transfer in counts as money put in: what arrived in this wallet (TXN-03).
  const summary = valuationSummary(
    transactions.map((tx) => ({ kind: tx.kind, amount: changeTo(tx, wallet.id) })),
  )
  const contributed = { minor: summary.contributed, currency: wallet.currency }
  const gain = { minor: summary.gain, currency: wallet.currency }
  return (
    <FeatureCard title={t('wallets.valuation.title')}>
      <div className="flex flex-col gap-1.5">
        <Fact label={t('wallets.valuation.contributed')}>
          <Amount parts={money.parts(contributed)} label={money.text(contributed)} />
        </Fact>
        <Fact label={summary.gain >= 0 ? t('wallets.valuation.gain') : t('wallets.valuation.loss')}>
          {/* DL-COL-07: a gain is money in, in Moss with its plus; a loss keeps the text color. */}
          <Amount
            parts={money.parts(gain, 'always')}
            label={money.text(gain, 'always')}
            {...(summary.gain > 0 ? { tone: 'moss' as const } : {})}
          />
          {summary.gainShare !== null && summary.gain !== 0 && (
            <span className="ml-1.5 text-text-muted">
              {new Intl.NumberFormat(money.locale, {
                style: 'percent',
                maximumFractionDigits: 1,
                signDisplay: 'exceptZero',
              })
                .format(summary.gainShare)
                .replace('-', '−')}
            </span>
          )}
        </Fact>
      </div>
      <Line>{t('wallets.valuation.hint')}</Line>
    </FeatureCard>
  )
}

/** WAL-15: fees to confirm or skip, then every fee with its next date. */
export function FeesCard({ wallet, today, defaultCurrency, onEdit }: Omit<CardProps, 'balance'>) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  const words = useWords()
  const save = useSaveRecords()
  const fees = wallet.fees ?? []
  const due = dueFees(fees, today)
  const of = (minor: number) => money.text({ minor, currency: wallet.currency })

  const handle = (fee: Fee, date: string, confirm: boolean) => {
    const changes = [
      walletChange(wallet, {
        fees: fees.map((each) => (each.id === fee.id ? handleFee(each, date) : each)),
      }),
    ]
    if (confirm) {
      const id = newId()
      // DL-MOT-02: the charge opens into the wallet's transactions.
      markNew(id)
      changes.unshift({
        id,
        body: transactionBody({
          kind: 'fee',
          walletId: wallet.id,
          date,
          amount: -fee.amount,
          note: fee.name,
        }),
      })
    }
    save.mutate(changes)
  }

  return (
    <FeatureCard title={t('wallets.fees.title')}>
      {fees.length === 0 && <Line>{t('wallets.fees.empty')}</Line>}
      {due.map(({ fee, date }) => (
        <div
          key={`${fee.id}-${date}`}
          className="flex flex-col gap-2 rounded-xl bg-inset px-3 py-2.5"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[0.9375rem] text-text">{fee.name}</span>
            <span className="text-[0.9375rem] text-text tabular-nums">{of(fee.amount)}</span>
          </div>
          <span className="text-[0.8125rem] text-text-muted">
            {t('wallets.fees.dueOn', { date: formatDay(date, today, money.locale, words) })}
          </span>
          {/* WAL-15: the person's reminder, right when they decide on the charge. */}
          {fee.note && <span className="text-[0.8125rem] text-text">{fee.note}</span>}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={save.isPending}
              onClick={() => {
                handle(fee, date, true)
              }}
            >
              {t('wallets.fees.confirm')}
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              disabled={save.isPending}
              onClick={() => {
                handle(fee, date, false)
              }}
            >
              {t('wallets.fees.skip')}
            </Button>
          </div>
        </div>
      ))}
      {fees.length > 0 && (
        <ul className="-mx-4">
          {fees.map((fee) => (
            <li key={fee.id}>
              <button
                type="button"
                onClick={() => {
                  onEdit({ fee })
                }}
                className="flex min-h-[3.25rem] w-full items-center gap-3 border-separator px-4 py-2 text-left not-first:border-t focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
              >
                <span className="flex flex-1 flex-col">
                  <span className="text-[0.9375rem] text-text">{fee.name}</span>
                  <span className="text-[0.8125rem] text-text-muted">
                    {t(`wallets.fees.every.${fee.every}`)} ·{' '}
                    {t('wallets.fees.next', {
                      date: formatDay(nextFeeDate(fee, today), today, money.locale, words),
                    })}
                  </span>
                  {fee.note && (
                    <span className="line-clamp-2 text-[0.8125rem] text-text-muted">
                      {fee.note}
                    </span>
                  )}
                </span>
                <span className="text-[0.9375rem] text-text tabular-nums">{of(fee.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => {
          onEdit({ fee: null })
        }}
        className="-mx-2 flex min-h-11 items-center gap-2 rounded-xl px-2 text-[0.9375rem] text-brand focus-visible:outline-2 focus-visible:outline-brand"
      >
        <PlusIcon aria-hidden className="size-5" />
        {t('wallets.fees.add')}
      </button>
    </FeatureCard>
  )
}
