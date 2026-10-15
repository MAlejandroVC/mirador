import { amountInput, parseAmount, toCalendarDate, type Transaction } from '@repo/core'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AmountField } from '../../components/ui/amount-field'
import { Button } from '../../components/ui/button'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet, SheetFooter } from '../../components/ui/sheet'
import { useMoney } from '../../lib/format'
import { type LedgerWallet, transactionBody, useSaveRecords } from './use-ledger'

// WAL-05: the opening balance, and any adjustment (WAL-07), are ordinary transactions:
// their amount and date can be changed, for example to load older history, or they
// can be deleted.
export function TransactionSheet({
  transaction,
  wallet,
  defaultCurrency,
  onClose,
  onDelete,
}: {
  transaction: Transaction | null
  wallet: LedgerWallet
  defaultCurrency: string
  onClose: () => void
  onDelete: (transaction: Transaction) => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={transaction !== null}
      title={transaction ? t(`wallets.transactions.${transaction.kind}`) : ''}
      cancelLabel={t('nav.cancel')}
      onClose={onClose}
    >
      {transaction && (
        <TransactionForm
          key={transaction.id}
          transaction={transaction}
          wallet={wallet}
          defaultCurrency={defaultCurrency}
          onClose={onClose}
          onDelete={onDelete}
        />
      )}
    </Sheet>
  )
}

function TransactionForm({
  transaction,
  wallet,
  defaultCurrency,
  onClose,
  onDelete,
}: {
  transaction: Transaction
  wallet: LedgerWallet
  defaultCurrency: string
  onClose: () => void
  onDelete: (transaction: Transaction) => void
}) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  const save = useSaveRecords()
  const dateId = useId()
  const [text, setText] = useState(amountInput(transaction.amount, wallet.currency, money.locale))
  const [negative, setNegative] = useState(transaction.amount < 0)
  const [date, setDate] = useState(transaction.date)
  const [touched, setTouched] = useState(false)
  const magnitude = parseAmount(text, wallet.currency, money.locale)
  const today = toCalendarDate(new Date())
  // DL-PAT-05: what happened and what to do, in words.
  const amountError = magnitude === null ? t('wallets.form.balanceInvalid') : null
  const dateError = !date
    ? t('wallets.transactions.dateMissing')
    : date > today
      ? t('wallets.transactions.dateFuture')
      : null
  const parts = money.parts({ minor: 0, currency: wallet.currency })
  const opening = transaction.kind === 'openingBalance'

  return (
    <>
      <SegmentedControl
        label={t('wallets.form.balance')}
        options={
          opening
            ? [
                { value: 'positive', label: t('wallets.form.have') },
                { value: 'negative', label: t('wallets.form.owe') },
              ]
            : [
                { value: 'positive', label: t('wallets.transactions.added') },
                { value: 'negative', label: t('wallets.transactions.removed') },
              ]
        }
        value={negative ? 'negative' : 'positive'}
        onChange={(value) => {
          setNegative(value === 'negative')
        }}
      />
      <AmountField
        label={t('wallets.transactions.amount')}
        value={text}
        onChange={setText}
        onBlur={() => {
          setTouched(true)
        }}
        prefix={parts.prefix.trim()}
        suffix={parts.suffix.trim()}
        error={touched ? amountError : null}
      />
      <div className="flex flex-col gap-1.5">
        <ul className="rounded-2xl bg-inset">
          <li className="flex min-h-[3.25rem] items-center gap-3 px-4">
            <label htmlFor={dateId} className="flex-1 text-[0.9375rem] text-text">
              {t('wallets.transactions.date')}
            </label>
            <input
              id={dateId}
              type="date"
              value={date}
              max={today}
              onChange={(event) => {
                setDate(event.target.value)
              }}
              aria-invalid={dateError ? true : undefined}
              className="min-h-11 bg-transparent text-right text-[0.9375rem] text-text focus:outline-2 focus:outline-brand"
            />
          </li>
        </ul>
        {dateError ? (
          <p className="px-4 text-[0.8125rem] text-warning">{dateError}</p>
        ) : (
          opening && (
            <p className="px-4 text-[0.8125rem] text-text-muted">
              {t('wallets.transactions.openingHint')}
            </p>
          )
        )}
      </div>
      <Button
        variant="danger"
        onClick={() => {
          onDelete(transaction)
        }}
      >
        {t('wallets.transactions.delete')}
      </Button>
      {save.isError && (
        <p className="px-4 text-[0.8125rem] text-warning">{t('wallets.saveFailed')}</p>
      )}
      <SheetFooter>
        <Button
          className="w-full"
          disabled={magnitude === null || dateError !== null || save.isPending}
          onClick={() => {
            if (magnitude === null || dateError) return
            const { id, ...record } = transaction
            save.mutate(
              [
                {
                  id,
                  body: transactionBody({
                    ...record,
                    date,
                    amount: negative ? -magnitude : magnitude,
                  }),
                },
              ],
              { onSuccess: onClose },
            )
          }}
        >
          {t('wallets.form.save')}
        </Button>
      </SheetFooter>
    </>
  )
}
