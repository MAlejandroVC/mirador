import {
  currencyName,
  toCalendarDate,
  type Transaction,
  walletBalance,
  walletTransactions,
} from '@repo/core'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionSheet } from '../../components/ui/action-sheet'
import { Amount } from '../../components/ui/amount'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { IconTile } from '../../components/ui/icon-tile'
import { FlagBannerIcon, ScalesIcon, WalletIcon } from '../../components/ui/icons'
import { List, ListButtonRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { useUndo } from '../../components/ui/use-undo'
import { formatDay, useMoney } from '../../lib/format'
import { BalanceSheet } from './balance-sheet'
import { TransactionSheet } from './transaction-sheet'
import {
  type RecordChange,
  transactionBody,
  useLedger,
  useSaveRecords,
  walletBody,
} from './use-ledger'
import { walletIconComponents } from './wallet-look'
import { WalletSheet } from './wallet-sheet'

// WAL-01: one wallet, pushed in from the list (DL-PAT-01): its balance (WAL-06), the
// transactions that make it up (WAL-05), updating the balance (WAL-07), and Edit at the
// top right, which is also where it is deleted (WAL-08).
export function WalletScreen({ walletId }: { walletId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: ledger } = useLedger()
  const save = useSaveRecords()
  const undo = useUndo()
  const [editing, setEditing] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [opened, setOpened] = useState<Transaction | null>(null)
  const defaultCurrency = ledger?.defaultCurrency ?? 'USD'
  const money = useMoney(defaultCurrency)
  const back = {
    label: t('nav.wallets'),
    onClick: () => {
      void navigate({ to: '/wallets' })
    },
  }
  const wallet = ledger?.wallets.find((candidate) => candidate.id === walletId)

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
  const balance = walletBalance(wallet.id, ledger.transactions)
  const today = toCalendarDate(new Date())
  const shown = { minor: balance, currency: wallet.currency }

  const deleteChanges = (): RecordChange[] => [
    ...transactions.map((transaction) => ({
      id: transaction.id,
      body: { deleted: true as const, type: 'transaction' },
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
        void navigate({ to: '/wallets' })
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

  function deleteTransaction(transaction: Transaction) {
    const { id, ...record } = transaction
    setOpened(null)
    save.mutate([{ id, body: { deleted: true, type: 'transaction' } }], {
      onSuccess: () => {
        undo({
          message: t('wallets.transactions.deleted'),
          undo: () => {
            save.mutate([{ id, body: transactionBody(record) }])
          },
        })
      },
    })
  }

  const description = [
    t(`wallets.presets.${wallet.preset}`),
    currencyName(wallet.currency, money.locale),
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
          {t('wallets.balance.update')}
        </Button>
      </section>

      {transactions.length > 0 ? (
        <List label={t('wallets.transactions.title')}>
          {transactions.map((transaction) => {
            const value = { minor: transaction.amount, currency: wallet.currency }
            const opening = transaction.kind === 'openingBalance'
            const signs = opening ? 'negative' : 'always'
            return (
              <ListButtonRow
                key={transaction.id}
                tone="text"
                // System transactions (CAT-05) take Stone, the quietest category color.
                leading={<IconTile icon={opening ? FlagBannerIcon : ScalesIcon} color="stone" />}
                title={t(`wallets.transactions.${transaction.kind}`)}
                subtitle={formatDay(transaction.date, today, money.locale, {
                  today: t('dates.today'),
                  yesterday: t('dates.yesterday'),
                })}
                trailing={
                  <Amount parts={money.parts(value, signs)} label={money.text(value, signs)} />
                }
                onClick={() => {
                  setOpened(transaction)
                }}
              />
            )
          })}
        </List>
      ) : (
        <EmptyState icon={FlagBannerIcon} title={t('wallets.transactions.emptyTitle')}>
          {t('wallets.transactions.emptyBody')}
        </EmptyState>
      )}

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
      <BalanceSheet
        open={updating}
        wallet={wallet}
        balance={balance}
        defaultCurrency={defaultCurrency}
        onClose={() => {
          setUpdating(false)
        }}
      />
      <TransactionSheet
        transaction={opened}
        wallet={wallet}
        defaultCurrency={defaultCurrency}
        onClose={() => {
          setOpened(null)
        }}
        onDelete={deleteTransaction}
      />
    </Page>
  )
}
