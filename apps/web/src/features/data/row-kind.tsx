import { toCalendarDate, walletBalances } from '@repo/core'
import { useTranslation } from 'react-i18next'
import { PickerRow } from '../../components/ui/picker-row'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { WalletPicker } from '../transactions/wallet-picker'
import { balanceEntries, type Ledger } from '../wallets/use-ledger'

import type { KindState, RowKind } from './statement-model'

// IMP-09, IMP-40: what a statement row is: an expense, income, or a transfer with
// another of the person's wallets, set the way quick add sets it (TXN-01). The
// statement's wallet is always one side of a transfer; choosing the other wallet on
// either side says which way the money went.

export function KindControl({
  value,
  onChange,
}: {
  value: KindState
  onChange: (next: KindState) => void
}) {
  const { t } = useTranslation()
  return (
    <SegmentedControl<RowKind>
      label={t('transactions.type')}
      options={[
        { value: 'expense', label: t('transactions.types.expense') },
        { value: 'income', label: t('transactions.types.income') },
        { value: 'transfer', label: t('transactions.types.transfer') },
      ]}
      value={value.kind}
      onChange={(kind) => {
        // An expense goes out and income comes in; a transfer keeps the way it went.
        onChange({
          ...value,
          kind,
          into: kind === 'transfer' ? value.into : kind === 'income',
        })
      }}
    />
  )
}

type Side = 'from' | 'to'

interface TransferProps {
  ledger: Ledger
  walletId: string | null
  value: KindState
}

/** The From and To rows of a transfer, one of them the statement's wallet. */
export function TransferRows({
  ledger,
  walletId,
  value,
  error,
  onPick,
}: TransferProps & { error: boolean; onPick: (side: Side) => void }) {
  const { t } = useTranslation()
  const names = new Map(ledger.wallets.map((item) => [item.id, item.name]))
  const mine = (walletId ? names.get(walletId) : undefined) ?? ''
  const other = value.other ? (names.get(value.other) ?? '') : t('pickers.choose')
  return (
    <>
      <PickerRow
        label={t('transactions.from')}
        value={value.into ? other : mine}
        error={error && value.into}
        onClick={() => {
          onPick('from')
        }}
      />
      <PickerRow
        label={t('transactions.to')}
        value={value.into ? mine : other}
        error={error && !value.into}
        separator
        onClick={() => {
          onPick('to')
        }}
      />
    </>
  )
}

/** The wallet picker the rows open, outside their list. */
export function TransferPicker({
  ledger,
  walletId,
  value,
  side,
  onChange,
  onClose,
}: TransferProps & {
  side: Side | null
  onChange: (next: KindState) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const wallet = ledger.wallets.find((item) => item.id === walletId)
  // Both sides are in the statement's currency, as the statement gives one amount.
  const choices = ledger.wallets.filter(
    (item) => item.active && item.currency === (wallet?.currency ?? ledger.defaultCurrency),
  )
  const balances = walletBalances(
    ledger.wallets,
    balanceEntries(ledger, toCalendarDate(new Date())),
  )
  return (
    <WalletPicker
      open={side !== null}
      title={side === 'to' ? t('transactions.to') : t('transactions.from')}
      wallets={choices}
      balances={balances}
      value={side === null ? null : (side === 'from') === value.into ? value.other : walletId}
      defaultCurrency={ledger.defaultCurrency}
      onChoose={(id) => {
        if (side === null) return
        // The statement's wallet on one side puts the other wallet on the other.
        if (id === walletId) onChange({ ...value, into: side === 'to' })
        else onChange({ ...value, other: id, into: side === 'from' })
        onClose()
      }}
      onClose={onClose}
    />
  )
}
