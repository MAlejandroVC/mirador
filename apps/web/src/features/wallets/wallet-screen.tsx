import {
  convert,
  currencyName,
  lastUsedWallet,
  pickableWallets,
  rateInUse,
  startingWallet,
  toCalendarDate,
  unitsPerOne,
  walletBalance,
  walletTransactions,
} from '@repo/core'
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { ActionSheet } from '../../components/ui/action-sheet'
import { Amount } from '../../components/ui/amount'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { IconTile } from '../../components/ui/icon-tile'
import { FlagBannerIcon, WalletIcon } from '../../components/ui/icons'
import { Page } from '../../components/ui/page'
import { useUndo } from '../../components/ui/use-undo'
import { formatDay, formatRate, useMoney } from '../../lib/format'
import { useMediaQuery } from '../../lib/use-media-query'
import { BalanceSheet } from './balance-sheet'
import {
  CreditLimitCard,
  type FeatureSheet,
  FeesCard,
  InterestCard,
  LoanCard,
  ValuationCard,
} from './feature-cards'
import { FeatureSheets } from './feature-sheets'
import { InstallmentPlans } from './installment-plans'
import { taxonomy } from '../categories/lookups'
import { EntrySheet } from '../transactions/entry-sheet'
import { RateSheet } from './rate-sheet'
import { useTransactionEditor } from '../transactions/use-transaction-editor'
import { TransactionRows } from './transaction-list'
import {
  type LedgerWallet,
  type RecordChange,
  newId,
  useLedger,
  useSaveRecords,
  walletBody,
  balanceEntries,
} from './use-ledger'
import { walletIconComponents } from './wallet-look'
import { WalletSheet } from './wallet-sheet'

// WAL-01: one wallet, pushed in from the list (DL-PAT-01): its balance (WAL-06), the
// latest transactions that make it up (WAL-05), a card for each feature switched on
// (WAL-13 to WAL-18), updating the balance (WAL-07), and Edit at the top right, which
// is also where it is deleted (WAL-08).
export function WalletScreen({ walletId }: { walletId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: ledger } = useLedger()
  const save = useSaveRecords()
  const undo = useUndo()
  const [editing, setEditing] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [feature, setFeature] = useState<FeatureSheet | null>(null)
  const [changingRate, setChangingRate] = useState(false)
  // WAL-25: paying the card opens a transfer to it, for the amount to pay.
  const [paying, setPaying] = useState<number | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const defaultCurrency = ledger?.defaultCurrency ?? 'USD'
  const money = useMoney(defaultCurrency)
  // The latest few, so the list doesn't fill the screen: 5 on a phone, 10 from a tablet.
  const wide = useMediaQuery('(min-width: 768px)')
  const back = useBack()
  const wallet = ledger?.wallets.find((candidate) => candidate.id === walletId)
  const editor = useTransactionEditor()

  if (!ledger) return null
  if (!wallet)
    return (
      <Page
        title={t('wallets.missing.title')}
        back={back}
        card={{
          icon: <IconTile icon={WalletIcon} size="large" />,
          description: t('wallets.missing.body'),
        }}
      />
    )

  const transactions = walletTransactions(wallet.id, ledger.transactions)
  const today = toCalendarDate(new Date())
  const balance = walletBalance(wallet.id, balanceEntries(ledger, today))
  const shown = { minor: balance, currency: wallet.currency }
  const on = (name: (typeof wallet.features)[number]) => wallet.features.includes(name)
  const cardProps = {
    wallet,
    balance,
    today,
    defaultCurrency,
    onEdit: setFeature,
  }

  // WAL-08: its transactions go with it, and the recurring transactions that use it.
  const deleteChanges = (): RecordChange[] => [
    ...transactions.map((transaction) => ({
      id: transaction.id,
      body: { deleted: true as const, type: 'transaction' },
    })),
    ...ledger.recurring
      .filter((recurring) => recurring.walletId === wallet.id || recurring.toWalletId === wallet.id)
      .map((recurring) => ({
        id: recurring.id,
        body: { deleted: true as const, type: 'recurring' },
      })),
    { id: wallet.id, body: { deleted: true, type: 'wallet' } },
  ]

  function deleteWallet() {
    if (!wallet) return
    const { id, ...record } = wallet
    setEditing(false)
    setConfirmingDelete(false)
    save.mutate(deleteChanges(), {
      onSuccess: () => {
        // The wallet's screen is gone: pop it, or go to Wallets when it was opened alone.
        if (back) back.onClick()
        else void navigate({ to: '/wallets', replace: true })
        // DL-PAT-06: a wallet with nothing in it goes at once, with Undo; one with
        // transactions was confirmed first, since that can't be undone.
        if (transactions.length === 0)
          undo({
            message: t('wallets.delete.done', { name: record.name }),
            undo: () => {
              save.mutate([{ id, body: walletBody(record) }])
            },
          })
      },
    })
  }

  // The wallet a card is paid from: the default one, else the last one used, else the
  // first one; never a credit card (WAL-24).
  const others = pickableWallets(ledger.wallets).filter(
    (candidate) => !candidate.features.includes('creditLimit'),
  )
  const payer =
    startingWallet(others, ledger.defaultWalletId, lastUsedWallet(ledger.transactions)) ?? others[0]

  const description = [
    t(`wallets.presets.${wallet.preset}`),
    currencyName(wallet.currency, money.locale),
    ...(ledger.defaultWalletId === wallet.id && wallet.active ? [t('wallets.default')] : []),
    ...(wallet.active ? [] : [t('wallets.inactive')]),
  ].join(' · ')

  return (
    <Page
      title={wallet.name}
      back={back}
      actions={
        <button
          type="button"
          onClick={() => {
            setEditing(true)
          }}
          className="min-h-11 rounded-xl px-2 text-[1.0625rem] text-brand focus-visible:outline-2 focus-visible:outline-brand"
        >
          {t('wallets.edit')}
        </button>
      }
      card={{
        icon: (
          <IconTile icon={walletIconComponents[wallet.icon]} color={wallet.color} size="large" />
        ),
        description,
      }}
    >
      {/* DL-NUM-01: the balance is this screen's one hero amount. */}
      <section className="flex flex-col gap-3 rounded-2xl bg-surface px-4 pt-3.5 pb-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[0.8125rem] text-text-muted">{t('wallets.balance.label')}</h2>
          <p>
            <Amount parts={money.parts(shown)} label={money.text(shown)} size="hero" />
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setUpdating(true)
          }}
        >
          {/* WAL-18: an investment's balance moves with the market, so it is its value. */}
          {on('valuations') ? t('wallets.valuation.update') : t('wallets.balance.update')}
        </Button>
        {wallet.currency !== defaultCurrency && (
          <RateLine
            wallet={wallet}
            balance={balance}
            today={today}
            onChange={() => {
              setChangingRate(true)
            }}
          />
        )}
      </section>

      {transactions.length > 0 ? (
        <TransactionRows
          label={t('wallets.transactions.title')}
          wallet={wallet}
          wallets={ledger.wallets}
          transactions={transactions}
          defaultCurrency={defaultCurrency}
          limit={wide ? 10 : 5}
          onOpen={(transaction) => {
            editor.open(transaction)
          }}
          onDelete={editor.remove}
        />
      ) : (
        <EmptyState icon={FlagBannerIcon} title={t('wallets.transactions.emptyTitle')}>
          {t('wallets.transactions.emptyBody')}
        </EmptyState>
      )}

      {on('creditLimit') && (
        <CreditLimitCard
          {...cardProps}
          transactions={transactions}
          onPay={(amount) => {
            setPaying(amount)
            setPayOpen(true)
          }}
        />
      )}
      {on('creditLimit') && (
        <InstallmentPlans
          wallet={wallet}
          transactions={transactions}
          taxonomy={taxonomy(ledger)}
          today={today}
          defaultCurrency={defaultCurrency}
          onOpen={(purchase) => {
            editor.open(purchase)
          }}
        />
      )}
      {on('loanSchedule') && <LoanCard {...cardProps} />}
      {on('interest') && (
        <InterestCard
          {...cardProps}
          transactions={transactions}
          onRecord={(amount) => {
            // WAL-14: the estimate, to confirm or correct before it is saved.
            editor.open(
              { id: newId(), kind: 'interest', walletId: wallet.id, date: today, amount },
              true,
            )
          }}
        />
      )}
      {on('valuations') && (
        <ValuationCard
          wallet={wallet}
          defaultCurrency={defaultCurrency}
          transactions={transactions}
        />
      )}
      {on('fees') && <FeesCard {...cardProps} />}

      <WalletSheet
        open={editing}
        mode={{ kind: 'edit', wallet, transactionCount: transactions.length }}
        defaultCurrency={defaultCurrency}
        onClose={() => {
          setEditing(false)
        }}
        onDelete={() => {
          // WAL-08: with transactions, offer inactive instead, and name the cost.
          if (transactions.length === 0) deleteWallet()
          else setConfirmingDelete(true)
        }}
      />
      <ActionSheet
        open={confirmingDelete}
        title={t('wallets.delete.title', { name: wallet.name })}
        message={t('wallets.delete.message', { count: transactions.length })}
        cancelLabel={t('nav.cancel')}
        actions={[
          ...(wallet.active
            ? [
                {
                  label: t('wallets.delete.inactive'),
                  onSelect: () => {
                    const { id, ...record } = wallet
                    setConfirmingDelete(false)
                    setEditing(false)
                    save.mutate([{ id, body: walletBody({ ...record, active: false }) }])
                  },
                },
              ]
            : []),
          { label: t('wallets.delete.confirm'), tone: 'danger' as const, onSelect: deleteWallet },
        ]}
        onClose={() => {
          setConfirmingDelete(false)
        }}
      />
      <FeatureSheets
        open={feature}
        wallet={wallet}
        defaultCurrency={defaultCurrency}
        onClose={() => {
          setFeature(null)
        }}
      />
      <BalanceSheet
        open={updating}
        kind={on('valuations') ? 'valuation' : 'adjustment'}
        wallet={wallet}
        balance={balance}
        defaultCurrency={defaultCurrency}
        onClose={() => {
          setUpdating(false)
        }}
      />
      {editor.sheet}
      {paying !== null && (
        <EntrySheet
          open={payOpen}
          mode={{
            kind: 'new',
            source: 'manual',
            seed: {
              type: 'transfer',
              amount: paying,
              toWalletId: wallet.id,
              walletId: payer?.id ?? '',
            },
          }}
          onClose={() => {
            setPayOpen(false)
          }}
        />
      )}
      <RateSheet
        open={changingRate}
        currency={wallet.currency}
        defaultCurrency={defaultCurrency}
        rates={ledger.rates}
        onClose={() => {
          setChangingRate(false)
        }}
      />
    </Page>
  )
}

/**
 * SYS-04, SYS-05: in a wallet kept in another currency, what it is worth in the default
 * one and the rate used, or a way to add the first rate. Tapping it adds or changes it.
 */
function RateLine({
  wallet,
  balance,
  today,
  onChange,
}: {
  wallet: LedgerWallet
  balance: number
  today: string
  onChange: () => void
}) {
  const { t } = useTranslation()
  const { data: ledger } = useLedger()
  const defaultCurrency = ledger?.defaultCurrency ?? 'USD'
  const money = useMoney(defaultCurrency)
  const inUse = rateInUse(wallet.currency, defaultCurrency, ledger?.rates ?? [], today)
  const worth = inUse && {
    minor: convert(balance, wallet.currency, defaultCurrency, inUse),
    currency: defaultCurrency,
  }
  return (
    <button
      type="button"
      onClick={onChange}
      className="-mx-4 -mb-4 flex min-h-[3.25rem] items-center gap-3 border-t-[0.5px] border-separator px-4 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      <span className="flex flex-1 flex-col">
        <span className="text-[0.9375rem] text-text">
          {worth ? t('rates.worth', { amount: money.text(worth) }) : t('rates.missingWallet')}
        </span>
        {inUse && (
          <span className="text-[0.8125rem] text-text-muted">
            {`1 ${wallet.currency} = ${formatRate(unitsPerOne(inUse), money.locale)} ${defaultCurrency} · ${formatDay(
              inUse.rate.date,
              today,
              money.locale,
              { today: t('dates.today'), yesterday: t('dates.yesterday') },
            )}`}
          </span>
        )}
      </span>
      <span className="text-[0.9375rem] text-brand">
        {inUse ? t('rates.change') : t('rates.add')}
      </span>
    </button>
  )
}
