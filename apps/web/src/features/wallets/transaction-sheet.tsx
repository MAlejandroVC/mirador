import {
  amountText,
  fractionDigits,
  parseAmount,
  toCalendarDate,
  type Transaction,
} from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AmountField } from '../../components/ui/amount-field'
import { Button } from '../../components/ui/button'
import { DateRow } from '../../components/ui/date-field'
import { FieldNote, FieldRows } from '../../components/ui/field-row'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet } from '../../components/ui/sheet'
import { SubmitButton } from '../../components/ui/submit-button'
import { useSubmit } from '../../components/ui/use-submit'
import { useMoney } from '../../lib/format'
import { markNew } from '../../lib/motion'
import { type LedgerWallet, transactionBody, useSaveRecords } from './use-ledger'

// WAL-05: the opening balance, and any adjustment (WAL-07), are ordinary transactions:
// their amount and date can be changed, for example to load older history, or they
// can be deleted.
export function TransactionSheet({
  transaction,
  isNew = false,
  wallet,
  defaultCurrency,
  onClose,
  onDelete,
}: {
  transaction: Transaction | null
  /** WAL-14: a transaction to confirm before it is saved, such as estimated interest. */
  isNew?: boolean
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
          isNew={isNew}
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
  isNew,
  wallet,
  defaultCurrency,
  onClose,
  onDelete,
}: {
  transaction: Transaction
  isNew: boolean
  wallet: LedgerWallet
  defaultCurrency: string
  onClose: () => void
  onDelete: (transaction: Transaction) => void
}) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  const save = useSaveRecords()
  const [text, setText] = useState(amountText(transaction.amount, wallet.currency, money.locale))
  const [negative, setNegative] = useState(transaction.amount < 0)
  const [date, setDate] = useState(transaction.date)
  const form = useSubmit()
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
        locale={money.locale}
        decimals={fractionDigits(wallet.currency)}
        prefix={parts.prefix.trim()}
        suffix={parts.suffix.trim()}
        error={form.tried ? amountError : null}
      />
      <FieldRows
        note={
          dateError ? (
            <FieldNote error>{dateError}</FieldNote>
          ) : opening ? (
            <FieldNote>{t('wallets.transactions.openingHint')}</FieldNote>
          ) : null
        }
      >
        <DateRow
          label={t('wallets.transactions.date')}
          value={date}
          max={today}
          onChange={setDate}
          error={dateError !== null}
        />
      </FieldRows>
      {!isNew && (
        <Button
          variant="danger"
          onClick={() => {
            onDelete(transaction)
          }}
        >
          {t('wallets.transactions.delete')}
        </Button>
      )}
      <SubmitButton
        button={form.button}
        done={form.done}
        pending={save.isPending}
        before={
          save.isError && (
            <p className="px-4 text-[0.8125rem] text-warning">{t('wallets.saveFailed')}</p>
          )
        }
        onClick={() => {
          form.submit(magnitude !== null && dateError === null, () => {
            if (magnitude === null) return
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
              {
                onSuccess: () => {
                  if (isNew) markNew(id)
                  form.finish(onClose)
                },
              },
            )
          })
        }}
      >
        {isNew ? t('wallets.transactions.record') : t('wallets.form.save')}
      </SubmitButton>
    </>
  )
}
