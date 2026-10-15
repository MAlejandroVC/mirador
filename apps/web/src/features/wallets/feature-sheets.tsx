import type { WalletRecord } from '@repo/api'
import {
  amountText,
  decimalInput,
  type Fee,
  fractionDigits,
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
import { DateRow, DayOfMonthRow } from '../../components/ui/date-field'
import { FieldNote, FieldRow, FieldRows, MoneyRow } from '../../components/ui/field-row'
import { Fold } from '../../components/ui/fold'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet } from '../../components/ui/sheet'
import { SubmitButton } from '../../components/ui/submit-button'
import { useSubmit } from '../../components/ui/use-submit'
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

/**
 * Saves the wallet with `patch` and closes with the save sequence. With fields still
 * missing (`patch` is null), tapping it points at them instead (DL-PAT-02).
 */
function SaveButton({
  wallet,
  form,
  patch,
  onClose,
}: {
  wallet: LedgerWallet
  form: ReturnType<typeof useSubmit>
  patch: Partial<WalletRecord> | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const save = useSaveRecords()
  return (
    <SubmitButton
      button={form.button}
      done={form.done}
      pending={save.isPending}
      before={save.isError && <FieldNote error>{t('wallets.saveFailed')}</FieldNote>}
      onClick={() => {
        form.submit(patch !== null, () => {
          if (patch)
            save.mutate([walletChange(wallet, patch)], {
              onSuccess: () => {
                form.finish(onClose)
              },
            })
        })
      }}
    >
      {t('wallets.form.save')}
    </SubmitButton>
  )
}

const percentText = (rate: number | undefined, locale: string) =>
  rate === undefined ? '' : decimalInput(rate, percentDecimals, locale)

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
  const form = useSubmit()
  const rate = parseDecimal(text, locale, percentDecimals)
  const valid = rate !== null && rate <= 100_000
  return (
    <>
      <Intro>{t('wallets.interest.intro')}</Intro>
      <FieldRows
        note={form.tried && !valid && <FieldNote error>{t('wallets.interest.invalid')}</FieldNote>}
      >
        <FieldRow
          label={t('wallets.interest.rate')}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
          }}
          inputMode="decimal"
          placeholder="0"
          suffix="%"
          autoFocus
          error={form.tried && !valid}
        />
      </FieldRows>
      {/* Which kind of rate it is, in the bank's own words, and how to tell. */}
      <div className="flex flex-col">
        <p className="px-4 pb-1.5 text-xs tracking-[0.04em] text-text-muted uppercase">
          {t('wallets.interest.type')}
        </p>
        <SegmentedControl
          label={t('wallets.interest.type')}
          options={[
            { value: 'effective', label: t('wallets.interest.effective') },
            { value: 'nominal', label: t('wallets.interest.nominal') },
          ]}
          value={type}
          onChange={setType}
        />
        <p className="px-4 pt-1.5 text-[0.8125rem] text-text-muted">
          {t('wallets.interest.typeHint')}
        </p>
        {/* A nominal rate also needs how often interest is added. */}
        <Fold open={type === 'nominal'}>
          <div className="flex flex-col gap-1.5 pt-3">
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
        </Fold>
      </div>
      <SaveButton
        wallet={wallet}
        form={form}
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
    wallet.credit ? amountText(wallet.credit.limit, wallet.currency, money.locale) : '',
  )
  const [closingDay, setClosingDay] = useState(wallet.credit?.closingDay ?? null)
  const [dueDay, setDueDay] = useState(wallet.credit?.dueDay ?? null)
  const form = useSubmit()
  const limitMinor = parseAmount(limit, wallet.currency, money.locale)
  const valid = limitMinor !== null && limitMinor > 0 && closingDay !== null && dueDay !== null
  return (
    <>
      <Intro>{t('wallets.credit.intro')}</Intro>
      <FieldRows
        note={
          form.tried && !valid ? (
            <FieldNote error>{t('wallets.credit.invalid')}</FieldNote>
          ) : (
            <FieldNote>{t('wallets.credit.hint')}</FieldNote>
          )
        }
      >
        <MoneyRow
          label={t('wallets.credit.limit')}
          value={limit}
          onChange={setLimit}
          locale={money.locale}
          decimals={fractionDigits(wallet.currency)}
          suffix={wallet.currency}
          autoFocus
          error={form.tried && (limitMinor === null || limitMinor === 0)}
        />
        <DayOfMonthRow
          label={t('wallets.credit.closingDay')}
          value={closingDay}
          onChange={setClosingDay}
          error={form.tried && closingDay === null}
        />
        <DayOfMonthRow
          label={t('wallets.credit.dueDay')}
          value={dueDay}
          onChange={setDueDay}
          error={form.tried && dueDay === null}
        />
      </FieldRows>
      <SaveButton
        wallet={wallet}
        form={form}
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
    loan ? amountText(loan.principal, wallet.currency, locale) : '',
  )
  const [rate, setRate] = useState(percentText(wallet.interest?.rate, locale))
  const [term, setTerm] = useState(loan ? String(loan.termMonths) : '')
  const [payment, setPayment] = useState(
    loan ? amountText(loan.payment, wallet.currency, locale) : '',
  )
  const [paymentDay, setPaymentDay] = useState(loan?.paymentDay ?? null)
  const form = useSubmit()
  const principalMinor = parseAmount(principal, wallet.currency, locale)
  const rateValue = rate.trim() === '' ? 0 : parseDecimal(rate, locale, percentDecimals)
  const termMonths = /^\d{1,3}$/.test(term.trim()) ? Number(term.trim()) : null
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
          form.tried && !valid ? (
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
        <MoneyRow
          label={t('wallets.loan.principal')}
          value={principal}
          onChange={setPrincipal}
          locale={locale}
          decimals={fractionDigits(wallet.currency)}
          suffix={wallet.currency}
          autoFocus
          error={form.tried && (principalMinor === null || principalMinor === 0)}
        />
        <FieldRow
          label={t('wallets.interest.rate')}
          value={rate}
          onChange={(event) => {
            setRate(event.target.value)
          }}
          inputMode="decimal"
          placeholder="0"
          suffix="%"
          error={form.tried && rateValue === null}
        />
        <FieldRow
          label={t('wallets.loan.term')}
          value={term}
          onChange={(event) => {
            setTerm(event.target.value)
          }}
          inputMode="numeric"
          placeholder="0"
          suffix={t('wallets.loan.months')}
          error={form.tried && (termMonths === null || termMonths === 0)}
        />
        {/* Left empty, the suggested payment (in the note below) is used. */}
        <MoneyRow
          label={t('wallets.loan.payment')}
          value={payment}
          onChange={setPayment}
          locale={locale}
          decimals={fractionDigits(wallet.currency)}
          suffix={wallet.currency}
          error={form.tried && payment.trim() !== '' && typed === null}
        />
        <DayOfMonthRow
          label={t('wallets.loan.paymentDay')}
          value={paymentDay}
          onChange={setPaymentDay}
          error={form.tried && paymentDay === null}
        />
      </FieldRows>
      <SaveButton
        wallet={wallet}
        form={form}
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

/** The fee without its note, so a note that was cleared is gone, not kept. */
function withoutNote(fee: Fee): Fee {
  const copy = { ...fee }
  delete copy.note
  return copy
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
    fee ? amountText(fee.amount, wallet.currency, money.locale) : '',
  )
  const [note, setNote] = useState(fee?.note ?? '')
  const [every, setEvery] = useState<Fee['every']>(fee?.every ?? 'month')
  const [start, setStart] = useState(fee?.start ?? today)
  const form = useSubmit()
  const minor = parseAmount(amount, wallet.currency, money.locale)
  const valid = name.trim() !== '' && minor !== null && minor > 0 && start !== ''
  const fees = wallet.fees ?? []
  // An empty note is left out rather than saved blank.
  const noted = note.trim() === '' ? {} : { note: note.trim() }
  const patch: Partial<WalletRecord> | null = valid
    ? {
        fees: fee
          ? fees.map((each) =>
              each.id === fee.id
                ? { ...withoutNote(each), name: name.trim(), amount: minor, every, start, ...noted }
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
                ...noted,
                ...(start < today ? { handled: today } : {}),
              },
            ],
      }
    : null
  return (
    <>
      <FieldRows
        note={
          form.tried && !valid ? (
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
          maxLength={60}
          placeholder={t('wallets.fees.namePlaceholder')}
          autoFocus
          error={form.tried && name.trim() === ''}
        />
        <MoneyRow
          label={t('wallets.fees.amount')}
          value={amount}
          onChange={setAmount}
          locale={money.locale}
          decimals={fractionDigits(wallet.currency)}
          suffix={wallet.currency}
          error={form.tried && (minor === null || minor === 0)}
        />
        <DateRow
          label={t('wallets.fees.start')}
          value={start}
          onChange={setStart}
          error={form.tried && start === ''}
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
      {/* A reminder of the fee's terms, such as when the bank waives it. */}
      <label className="flex flex-col gap-1.5">
        <span className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
          {t('wallets.fees.note')}
        </span>
        <textarea
          value={note}
          onChange={(event) => {
            setNote(event.target.value)
          }}
          maxLength={200}
          rows={2}
          placeholder={t('wallets.fees.notePlaceholder')}
          className="min-h-[3.25rem] resize-none rounded-2xl bg-inset px-4 py-3 text-[0.9375rem] text-text caret-brand placeholder:text-text-faint focus:outline-none"
        />
      </label>
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
      <SaveButton wallet={wallet} form={form} patch={patch} onClose={onClose} />
    </>
  )
}
