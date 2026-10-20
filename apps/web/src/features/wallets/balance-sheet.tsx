import { balanceAdjustment, fractionDigits, parseAmount, toCalendarDate } from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AmountField } from '../../components/ui/amount-field'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet } from '../../components/ui/sheet'
import { SubmitButton } from '../../components/ui/submit-button'
import { useSubmit } from '../../components/ui/use-submit'
import { useMoney } from '../../lib/format'
import { markNew } from '../../lib/motion'
import {
  type LedgerWallet,
  newId,
  transactionBody,
  useSaveRecords,
  walletChange,
} from './use-ledger'

// WAL-07: the person types the balance their bank or their pocket shows; when it
// differs from Mirador's, the difference is recorded as an adjustment dated today.
// Either way the wallet is marked checked today, so Home stops asking (DSH-05).
// WAL-18: with valuations on, it is the investment's value, and the difference is a
// market-value update, counted as a gain or loss rather than money put in.
export function BalanceSheet({
  open,
  kind = 'adjustment',
  wallet,
  balance,
  defaultCurrency,
  onClose,
}: {
  open: boolean
  kind?: 'adjustment' | 'valuation'
  wallet: LedgerWallet
  balance: number
  defaultCurrency: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={open}
      title={kind === 'valuation' ? t('wallets.valuation.update') : t('wallets.balance.title')}
      cancelLabel={t('nav.cancel')}
      onClose={onClose}
    >
      {open && (
        <BalanceForm
          kind={kind}
          wallet={wallet}
          balance={balance}
          defaultCurrency={defaultCurrency}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function BalanceForm({
  kind,
  wallet,
  balance,
  defaultCurrency,
  onClose,
}: {
  kind: 'adjustment' | 'valuation'
  wallet: LedgerWallet
  balance: number
  defaultCurrency: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  const save = useSaveRecords()
  const [text, setText] = useState('')
  const [owed, setOwed] = useState(balance < 0)
  const form = useSubmit()
  const magnitude = parseAmount(text, wallet.currency, money.locale)
  const actual = magnitude === null ? null : owed ? -magnitude : magnitude
  const adjustment =
    actual === null
      ? null
      : balanceAdjustment(wallet.id, balance, actual, toCalendarDate(new Date()), kind)
  const valuation = kind === 'valuation'
  const parts = money.parts({ minor: 0, currency: wallet.currency })
  const now = money.text({ minor: balance, currency: wallet.currency })

  return (
    <>
      <p className="px-2 text-center text-[0.9375rem] text-text-muted">
        {valuation
          ? t('wallets.valuation.intro', { balance: now })
          : t('wallets.balance.intro', { balance: now })}
      </p>
      <SegmentedControl
        label={t('wallets.form.balance')}
        options={[
          { value: 'have', label: t('wallets.form.have') },
          { value: 'owe', label: t('wallets.form.owe') },
        ]}
        value={owed ? 'owe' : 'have'}
        onChange={(value) => {
          setOwed(value === 'owe')
        }}
      />
      <AmountField
        label={valuation ? t('wallets.valuation.actual') : t('wallets.balance.actual')}
        value={text}
        onChange={setText}
        locale={money.locale}
        decimals={fractionDigits(wallet.currency)}
        prefix={parts.prefix.trim()}
        suffix={parts.suffix.trim()}
        error={form.tried && magnitude === null ? t('wallets.form.balanceInvalid') : null}
        autoFocus
      />
      <p role="status" className="min-h-10 px-2 text-center text-[0.9375rem] text-text">
        {actual === null
          ? ''
          : adjustment
            ? t(valuation ? 'wallets.valuation.willChange' : 'wallets.balance.willAdjust', {
                amount: money.text(
                  { minor: adjustment.amount, currency: wallet.currency },
                  'always',
                ),
              })
            : t('wallets.balance.matches')}
      </p>
      <SubmitButton
        button={form.button}
        done={form.done}
        pending={save.isPending}
        before={
          save.isError && (
            <p className="px-2 text-center text-[0.8125rem] text-warning">
              {t('wallets.saveFailed')}
            </p>
          )
        }
        onClick={() => {
          form.submit(actual !== null, () => {
            // DSH-05: the wallet remembers the day it was checked, even when the balance
            // was already right and there is nothing else to record.
            const checked = walletChange(wallet, { checkedOn: toCalendarDate(new Date()) })
            const id = newId()
            save.mutate(
              adjustment ? [{ id, body: transactionBody(adjustment) }, checked] : [checked],
              {
                onSuccess: () => {
                  if (adjustment) markNew(id)
                  form.finish(onClose)
                },
              },
            )
          })
        }}
      >
        {valuation ? t('wallets.valuation.record') : t('wallets.balance.record')}
      </SubmitButton>
    </>
  )
}
