import { balanceAdjustment, parseAmount, toCalendarDate } from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AmountField } from '../../components/ui/amount-field'
import { Button } from '../../components/ui/button'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet, SheetFooter } from '../../components/ui/sheet'
import { useMoney } from '../../lib/format'
import { type LedgerWallet, newId, transactionBody, useSaveRecords } from './use-ledger'

// WAL-07: the person types the balance their bank or their pocket shows; when it
// differs from Mirador's, the difference is recorded as an adjustment dated today.
export function BalanceSheet({
  open,
  wallet,
  balance,
  defaultCurrency,
  onClose,
}: {
  open: boolean
  wallet: LedgerWallet
  balance: number
  defaultCurrency: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={open}
      title={t('wallets.balance.title')}
      cancelLabel={t('nav.cancel')}
      onClose={onClose}
    >
      {open && (
        <BalanceForm
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
  wallet,
  balance,
  defaultCurrency,
  onClose,
}: {
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
  const [touched, setTouched] = useState(false)
  const magnitude = parseAmount(text, wallet.currency, money.locale)
  const actual = magnitude === null ? null : owed ? -magnitude : magnitude
  const adjustment =
    actual === null
      ? null
      : balanceAdjustment(wallet.id, balance, actual, toCalendarDate(new Date()))
  const invalid = text.trim() !== '' && magnitude === null
  const parts = money.parts({ minor: 0, currency: wallet.currency })
  const now = money.text({ minor: balance, currency: wallet.currency })

  return (
    <>
      <p className="px-2 text-center text-[0.9375rem] text-text-muted">
        {t('wallets.balance.intro', { balance: now })}
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
        label={t('wallets.balance.actual')}
        value={text}
        onChange={setText}
        onBlur={() => {
          setTouched(true)
        }}
        prefix={parts.prefix.trim()}
        suffix={parts.suffix.trim()}
        error={touched && invalid ? t('wallets.form.balanceInvalid') : null}
        autoFocus
      />
      <p role="status" className="min-h-10 px-2 text-center text-[0.9375rem] text-text">
        {actual === null
          ? ''
          : adjustment
            ? t('wallets.balance.willAdjust', {
                amount: money.text(
                  { minor: adjustment.amount, currency: wallet.currency },
                  'always',
                ),
              })
            : t('wallets.balance.matches')}
      </p>
      {save.isError && (
        <p className="px-2 text-center text-[0.8125rem] text-warning">{t('wallets.saveFailed')}</p>
      )}
      <SheetFooter>
        <Button
          className="w-full"
          disabled={!adjustment || save.isPending}
          onClick={() => {
            if (!adjustment) return
            save.mutate([{ id: newId(), body: transactionBody(adjustment) }], {
              onSuccess: onClose,
            })
          }}
        >
          {t('wallets.balance.record')}
        </Button>
      </SheetFooter>
    </>
  )
}
