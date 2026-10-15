import type { WalletRecord } from '@repo/api'
import {
  amountInput,
  decimalInput,
  type Fee,
  type InterestSettings,
  loanPayment,
  parseAmount,
  parseDecimal,
  percentDecimals,
  toCalendarDate,
} from '@repo/core'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { FieldNote, FieldRow, FieldRows } from '../../components/ui/field-row'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet, SheetFooter } from '../../components/ui/sheet'
import { useLocale, useMoney } from '../../lib/format'
import type { FeatureSheet } from './feature-cards'
import { type LedgerWallet, newId, useSaveRecords, walletChange } from './use-ledger'

// WAL-13 to WAL-17: the details of one feature, in a sheet opened from its card. Each
// asks only what the bank's statement or contract shows, in its words, and saves the
// wallet record (SEC-01: encrypted like everything else).

export function FeatureSheets({
  open,
  wallet,
  defaultCurrency,
  onClose,
}: {
  open: FeatureSheet | null
  wallet: LedgerWallet
  defaultCurrency: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const title =
    open === null
      ? ''
      : typeof open === 'string'
        ? t(`wallets.${open}.title`)
        : open.fee
          ? t('wallets.fees.editTitle')
          : t('wallets.fees.newTitle')
  return (
    <Sheet open={open !== null} title={title} cancelLabel={t('nav.cancel')} onClose={onClose}>
      {open === 'interest' && <InterestForm wallet={wallet} onClose={onClose} />}
      {open === 'credit' && (
        <CreditForm wallet={wallet} defaultCurrency={defaultCurrency} onClose={onClose} />
      )}
      {open === 'loan' && (
        <LoanForm wallet={wallet} defaultCurrency={defaultCurrency} onClose={onClose} />
      )}
      {open !== null && typeof open === 'object' && (
        <FeeForm
          wallet={wallet}
          fee={open.fee}
          defaultCurrency={defaultCurrency}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function Intro({ children }: { children: ReactNode }) {
  return <p className="px-2 text-center text-[0.9375rem] text-text-muted">{children}</p>
}

/** Saves the wallet with `patch`, and closes when it's saved. */
function SaveButton({
  wallet,
  patch,
  disabled,
  onClose,
}: {
  wallet: LedgerWallet
  patch: Partial<WalletRecord> | null
  disabled?: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const save = useSaveRecords()
  return (
    <>
      {save.isError && <FieldNote error>{t('wallets.saveFailed')}</FieldNote>}
      <SheetFooter>
        <Button
          className="w-full"
          disabled={patch === null || disabled === true || save.isPending}
          onClick={() => {
            if (patch) save.mutate([walletChange(wallet, patch)], { onSuccess: onClose })
          }}
        >
          {t('wallets.form.save')}
        </Button>
      </SheetFooter>
    </>
  )
}

const percentText = (rate: number | undefined, locale: string) =>
  rate === undefined ? '' : decimalInput(rate, percentDecimals, locale)

/** A day of the month typed as text: 1 to 31, or null. */
function parseDay(text: string): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null
  const day = Number(text.trim())
  return day >= 1 && day <= 31 ? day : null
}

/** WAL-13: the annual rate and how the bank quotes it. */
function InterestForm({ wallet, onClose }: { wallet: LedgerWallet; onClose: () => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  // Savings in Mexico quote the GAT (effective); cards and loans an annual rate
  // (nominal, monthly). That is the starting point; both are a tap away.
  const owed = wallet.preset === 'creditCard' || wallet.preset === 'loan'
  const start: InterestSettings = wallet.interest ?? {
    rate: 0,
    type: owed ? 'nominal' : 'effective',
    compounding: owed ? 'monthly' : 'daily',
  }
  const [text, setText] = useState(percentText(wallet.interest?.rate, locale))
  const [type, setType] = useState(start.type)
  const [compounding, setCompounding] = useState(start.compounding)
  const [touched, setTouched] = useState(false)
  const rate = parseDecimal(text, locale, percentDecimals)
  const valid = rate !== null && rate <= 100_000
  return (
    <>
      <Intro>{t('wallets.interest.intro')}</Intro>
      <FieldRows
        note={
          touched && !valid ? (
            <FieldNote error>{t('wallets.interest.invalid')}</FieldNote>
          ) : (
            <FieldNote>
              {type === 'effective'
                ? t('wallets.interest.effectiveHint')
                : t('wallets.interest.nominalHint')}
            </FieldNote>
          )
        }
      >
        <FieldRow
          label={t('wallets.interest.rate')}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
          }}
          onBlur={() => {
            setTouched(true)
          }}
          inputMode="decimal"
          placeholder="0.00"
          suffix="%"
          autoFocus
          error={touched && !valid}
        />
      </FieldRows>
      <SegmentedControl
        label={t('wallets.interest.type')}
        options={[
          { value: 'effective', label: t('wallets.interest.effective') },
          { value: 'nominal', label: t('wallets.interest.nominal') },
        ]}
        value={type}
        onChange={setType}
      />
      {type === 'nominal' && (
        <div className="flex flex-col gap-1.5">
          <p className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
            {t('wallets.interest.compoundingLabel')}
          </p>
          <SegmentedControl
            label={t('wallets.interest.compoundingLabel')}
            options={(['daily', 'monthly', 'yearly'] as const).map((value) => ({
              value,
              label: t(`wallets.interest.compounding.${value}`),
            }))}
            value={compounding}
            onChange={setCompounding}
          />
        </div>
      )}
      <SaveButton
        wallet={wallet}
        patch={valid ? { interest: { rate, type, compounding } } : null}
        onClose={onClose}
      />
    </>
  )
}

/** WAL-16: the limit and the two days on the statement. */
function CreditForm({
  wallet,
  defaultCurrency,
  onClose,
}: {
  wallet: LedgerWallet
  defaultCurrency: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  const [limit, setLimit] = useState(
    wallet.credit ? amountInput(wallet.credit.limit, wallet.currency, money.locale) : '',
  )
  const [closing, setClosing] = useState(wallet.credit ? String(wallet.credit.closingDay) : '')
  const [due, setDue] = useState(wallet.credit ? String(wallet.credit.dueDay) : '')
  const [touched, setTouched] = useState(false)
  const limitMinor = parseAmount(limit, wallet.currency, money.locale)
  const closingDay = parseDay(closing)
  const dueDay = parseDay(due)
  const valid = limitMinor !== null && limitMinor > 0 && closingDay !== null && dueDay !== null
  return (
    <>
      <Intro>{t('wallets.credit.intro')}</Intro>
      <FieldRows
        note={
          touched && !valid ? (
            <FieldNote error>{t('wallets.credit.invalid')}</FieldNote>
          ) : (
            <FieldNote>{t('wallets.credit.hint')}</FieldNote>
          )
        }
      >
        <FieldRow
          label={t('wallets.credit.limit')}
          value={limit}
          onChange={(event) => {
            setLimit(event.target.value)
          }}
          onBlur={() => {
            setTouched(true)
          }}
          inputMode="decimal"
          placeholder="0.00"
          suffix={wallet.currency}
          autoFocus
          error={touched && (limitMinor === null || limitMinor === 0)}
        />
        <FieldRow
          label={t('wallets.credit.closingDay')}
          value={closing}
          onChange={(event) => {
            setClosing(event.target.value)
          }}
          inputMode="numeric"
          placeholder="1–31"
          error={touched && closingDay === null}
        />
        <FieldRow
          label={t('wallets.credit.dueDay')}
          value={due}
          onChange={(event) => {
            setDue(event.target.value)
          }}
          inputMode="numeric"
          placeholder="1–31"
          error={touched && dueDay === null}
        />
      </FieldRows>
      <SaveButton
        wallet={wallet}
        patch={valid ? { credit: { limit: limitMinor, closingDay, dueDay } } : null}
        onClose={onClose}
      />
    </>
  )
}

/**
 * WAL-17: the contract's amount, term and payment day. The monthly payment can be left
 * empty and is then worked out from the rate; the rate is the wallet's interest
 * (WAL-13), asked here too so a loan needs one sheet, and switched on with it.
 */
function LoanForm({
  wallet,
  defaultCurrency,
  onClose,
}: {
  wallet: LedgerWallet
  defaultCurrency: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  const locale = money.locale
  const loan = wallet.loan
  const [principal, setPrincipal] = useState(
    loan ? amountInput(loan.principal, wallet.currency, locale) : '',
  )
  const [rate, setRate] = useState(percentText(wallet.interest?.rate, locale))
  const [term, setTerm] = useState(loan ? String(loan.termMonths) : '')
  const [payment, setPayment] = useState(
    loan ? amountInput(loan.payment, wallet.currency, locale) : '',
  )
  const [day, setDay] = useState(loan ? String(loan.paymentDay) : '')
  const [touched, setTouched] = useState(false)
  const principalMinor = parseAmount(principal, wallet.currency, locale)
  const rateValue = rate.trim() === '' ? 0 : parseDecimal(rate, locale, percentDecimals)
  const termMonths = /^\d{1,3}$/.test(term.trim()) ? Number(term.trim()) : null
  const paymentDay = parseDay(day)
  const interest: InterestSettings | undefined =
    rateValue === null
      ? undefined
      : {
          type: wallet.interest?.type ?? 'nominal',
          compounding: wallet.interest?.compounding ?? 'monthly',
          rate: rateValue,
        }
  const suggested =
    principalMinor && termMonths ? loanPayment(principalMinor, termMonths, interest) : null
  const typed = payment.trim() === '' ? null : parseAmount(payment, wallet.currency, locale)
  const paymentMinor = typed ?? suggested
  const valid =
    principalMinor !== null &&
    principalMinor > 0 &&
    rateValue !== null &&
    termMonths !== null &&
    termMonths > 0 &&
    paymentDay !== null &&
    paymentMinor !== null &&
    paymentMinor > 0 &&
    (payment.trim() === '' || typed !== null)
  return (
    <>
      <Intro>{t('wallets.loan.intro')}</Intro>
      <FieldRows
        note={
          touched && !valid ? (
            <FieldNote error>{t('wallets.loan.invalid')}</FieldNote>
          ) : suggested && payment.trim() === '' ? (
            <FieldNote>
              {t('wallets.loan.suggested', {
                amount: money.text({ minor: suggested, currency: wallet.currency }),
              })}
            </FieldNote>
          ) : null
        }
      >
        <FieldRow
          label={t('wallets.loan.principal')}
          value={principal}
          onChange={(event) => {
            setPrincipal(event.target.value)
          }}
          onBlur={() => {
            setTouched(true)
          }}
          inputMode="decimal"
          placeholder="0.00"
          suffix={wallet.currency}
          autoFocus
          error={touched && (principalMinor === null || principalMinor === 0)}
        />
        <FieldRow
          label={t('wallets.interest.rate')}
          value={rate}
          onChange={(event) => {
            setRate(event.target.value)
          }}
          inputMode="decimal"
          placeholder="0.00"
          suffix="%"
          error={touched && rateValue === null}
        />
        <FieldRow
          label={t('wallets.loan.term')}
          value={term}
          onChange={(event) => {
            setTerm(event.target.value)
          }}
          inputMode="numeric"
          placeholder="48"
          suffix={t('wallets.loan.months')}
          error={touched && (termMonths === null || termMonths === 0)}
        />
        <FieldRow
          label={t('wallets.loan.payment')}
          value={payment}
          onChange={(event) => {
            setPayment(event.target.value)
          }}
          inputMode="decimal"
          placeholder={suggested ? amountInput(suggested, wallet.currency, locale) : '0.00'}
          suffix={wallet.currency}
          error={touched && payment.trim() !== '' && typed === null}
        />
        <FieldRow
          label={t('wallets.loan.paymentDay')}
          value={day}
          onChange={(event) => {
            setDay(event.target.value)
          }}
          inputMode="numeric"
          placeholder="1–31"
          error={touched && paymentDay === null}
        />
      </FieldRows>
      <SaveButton
        wallet={wallet}
        patch={
          valid && interest
            ? {
                loan: { principal: principalMinor, termMonths, payment: paymentMinor, paymentDay },
                interest,
                features: wallet.features.includes('interest')
                  ? wallet.features
                  : [...wallet.features, 'interest'],
              }
            : null
        }
        onClose={onClose}
      />
    </>
  )
}

/** WAL-15: one fee: its name, amount, how often, and when it is first charged. */
function FeeForm({
  wallet,
  fee,
  defaultCurrency,
  onClose,
}: {
  wallet: LedgerWallet
  fee: Fee | null
  defaultCurrency: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  const save = useSaveRecords()
  const today = toCalendarDate(new Date())
  const [name, setName] = useState(fee?.name ?? '')
  const [amount, setAmount] = useState(
    fee ? amountInput(fee.amount, wallet.currency, money.locale) : '',
  )
  const [every, setEvery] = useState<Fee['every']>(fee?.every ?? 'month')
  const [start, setStart] = useState(fee?.start ?? today)
  const [touched, setTouched] = useState(false)
  const minor = parseAmount(amount, wallet.currency, money.locale)
  const valid = name.trim() !== '' && minor !== null && minor > 0 && start !== ''
  const fees = wallet.fees ?? []
  const patch: Partial<WalletRecord> | null = valid
    ? {
        fees: fee
          ? fees.map((each) =>
              each.id === fee.id
                ? { ...each, name: name.trim(), amount: minor, every, start }
                : each,
            )
          : [
              ...fees,
              // A fee starting before today was paid already; only later dates are offered.
              {
                id: newId(),
                name: name.trim(),
                amount: minor,
                every,
                start,
                ...(start < today ? { handled: today } : {}),
              },
            ],
      }
    : null
  return (
    <>
      <FieldRows
        note={
          touched && !valid ? (
            <FieldNote error>{t('wallets.fees.invalid')}</FieldNote>
          ) : (
            <FieldNote>{t('wallets.fees.hint')}</FieldNote>
          )
        }
      >
        <FieldRow
          label={t('wallets.fees.name')}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
          }}
          onBlur={() => {
            setTouched(true)
          }}
          maxLength={60}
          placeholder={t('wallets.fees.namePlaceholder')}
          autoFocus
          error={touched && name.trim() === ''}
        />
        <FieldRow
          label={t('wallets.fees.amount')}
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value)
          }}
          inputMode="decimal"
          placeholder="0.00"
          suffix={wallet.currency}
          error={touched && (minor === null || minor === 0)}
        />
        <FieldRow
          label={t('wallets.fees.start')}
          type="date"
          value={start}
          onChange={(event) => {
            setStart(event.target.value)
          }}
          error={touched && start === ''}
        />
      </FieldRows>
      <SegmentedControl
        label={t('wallets.fees.everyLabel')}
        options={[
          { value: 'month', label: t('wallets.fees.every.month') },
          { value: 'year', label: t('wallets.fees.every.year') },
        ]}
        value={every}
        onChange={setEvery}
      />
      {fee && (
        <Button
          variant="danger"
          disabled={save.isPending}
          onClick={() => {
            save.mutate(
              [walletChange(wallet, { fees: fees.filter((each) => each.id !== fee.id) })],
              {
                onSuccess: onClose,
              },
            )
          }}
        >
          {t('wallets.fees.delete')}
        </Button>
      )}
      <SaveButton wallet={wallet} patch={patch} onClose={onClose} />
    </>
  )
}
