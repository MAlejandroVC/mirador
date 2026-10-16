import { billingDates, fractionDigits, toCalendarDate } from '@repo/core'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionSheet } from '../../components/ui/action-sheet'
import { ChoiceRow } from '../../components/ui/choice-row'
import { FieldNote, FieldRow, MoneyRow } from '../../components/ui/field-row'
import { List } from '../../components/ui/list'
import { PickerRow } from '../../components/ui/picker-row'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet } from '../../components/ui/sheet'
import { formatShortDate, useMoney } from '../../lib/format'
import { chosenMonths, type InstallmentState, usualMonths } from './installments-state'

const mostDeferred = 6

/**
 * TXN-30, TXN-31: paying an expense on a credit card in monthly installments. Off, it
 * is one row with its hint (DL-PAT-07); on, the months, interest-free or with interest
 * (then the monthly payment the bank quotes), and when the first one is billed open in
 * place (DL-MOT-07), with one sentence saying what the card will do.
 */
export function InstallmentsFields({
  state,
  onChange,
  currency,
  closingDay,
  date,
  price,
  payment,
  errors,
  left,
}: {
  state: InstallmentState
  onChange: (state: InstallmentState) => void
  currency: string
  closingDay: number
  date: string
  /** The amount typed, the price before any interest. */
  price: number | null
  /** The monthly payment typed, with interest. */
  payment: number | null
  /** What to say under the fields after Save was tapped, if anything is missing. */
  errors: { months: boolean; payment: string | null }
  /** On a saved plan, what is still to be billed, which can be paid off early (TXN-33). */
  left: number | null
}) {
  const { t } = useTranslation()
  const money = useMoney(currency)
  const monthsId = useId()
  const [choosingFirst, setChoosingFirst] = useState(false)
  const [payingOff, setPayingOff] = useState(false)
  const set = (patch: Partial<InstallmentState>) => {
    onChange({ ...state, ...patch })
  }
  const months = chosenMonths(state)
  const of = (minor: number) => money.text({ minor, currency })
  const today = toCalendarDate(new Date())
  const firstLabel =
    state.deferred === 0
      ? t('installments.firstNext')
      : t('installments.firstLater', { count: state.deferred })

  let summary: string | null = null
  if (months !== null && price !== null && price > 0) {
    const total = state.interest && payment !== null ? payment * months : price
    const [first] = billingDates(
      {
        kind: 'expense',
        walletId: '',
        date,
        amount: -total,
        installments: { months, ...(state.deferred > 0 ? { deferred: state.deferred } : {}) },
      },
      closingDay,
    )
    const values = {
      monthly: of(Math.trunc(total / months)),
      months,
      total: of(total),
      date: first ? formatShortDate(first, today, money.locale) : '',
    }
    summary = state.interest
      ? payment !== null && total >= price
        ? t('installments.summaryInterest', { ...values, interest: of(total - price) })
        : null
      : t('installments.summaryFree', values)
  }
  const error = errors.months ? t('installments.monthsMissing') : errors.payment

  return (
    <div className="flex flex-col gap-1.5">
      <ul className="rounded-2xl bg-inset">
        <ChoiceRow
          title={t('installments.title')}
          subtitle={t('installments.hint')}
          checked={state.on}
          onToggle={() => {
            set({ on: !state.on })
          }}
        />
        <li
          className="fold"
          data-closed={state.on ? undefined : ''}
          aria-hidden={!state.on || undefined}
          inert={!state.on}
        >
          <ul>
            {/* The usual plans as one tap each, in two rows of 44 px targets. */}
            <li className="flex flex-col gap-2.5 border-t border-separator px-4 pt-3 pb-4">
              <span id={monthsId} className="text-[0.9375rem] text-text">
                {t('installments.months')}
              </span>
              <div
                role="radiogroup"
                aria-labelledby={monthsId}
                className="grid grid-cols-4 gap-1.5"
              >
                {usualMonths.map((option) => (
                  <Chip
                    key={option}
                    selected={!state.other && state.months === option}
                    onClick={() => {
                      set({ other: false, months: option })
                    }}
                  >
                    {String(option)}
                  </Chip>
                ))}
                <Chip
                  selected={state.other}
                  wide
                  error={errors.months}
                  onClick={() => {
                    set({ other: true })
                  }}
                >
                  {t('installments.other')}
                </Chip>
              </div>
            </li>
            <li
              className="fold"
              data-closed={state.other ? undefined : ''}
              aria-hidden={!state.other || undefined}
              inert={!state.other}
            >
              <ul>
                <FieldRow
                  label={t('installments.months')}
                  value={state.monthsText}
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="2–60"
                  error={errors.months}
                  onChange={(event) => {
                    set({ monthsText: event.target.value.replace(/\D/g, '') })
                  }}
                />
              </ul>
            </li>
            <li className="border-t border-separator px-4 py-3">
              <SegmentedControl<'free' | 'interest'>
                label={t('installments.interest')}
                options={[
                  { value: 'free', label: t('installments.interestFree') },
                  { value: 'interest', label: t('installments.withInterest') },
                ]}
                value={state.interest ? 'interest' : 'free'}
                onChange={(next) => {
                  set({ interest: next === 'interest' })
                }}
              />
            </li>
            {/* TXN-31: the bank quotes the payment; the app never guesses a rate. */}
            <li
              className="fold"
              data-closed={state.interest ? undefined : ''}
              aria-hidden={!state.interest || undefined}
              inert={!state.interest}
            >
              <ul>
                <MoneyRow
                  label={t('installments.payment')}
                  value={state.paymentText}
                  onChange={(next) => {
                    set({ paymentText: next })
                  }}
                  locale={money.locale}
                  decimals={fractionDigits(currency)}
                  error={errors.payment !== null}
                />
              </ul>
            </li>
            <PickerRow
              label={t('installments.first')}
              value={firstLabel}
              error={false}
              separator
              onClick={() => {
                setChoosingFirst(true)
              }}
            />
            {left !== null && state.paidOff === undefined && (
              <li className="border-t border-separator">
                <button
                  type="button"
                  onClick={() => {
                    setPayingOff(true)
                  }}
                  className="flex min-h-[3.25rem] w-full items-center px-4 text-left text-[0.9375rem] text-brand focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                >
                  {t('installments.payOff')}
                </button>
              </li>
            )}
          </ul>
        </li>
      </ul>
      {state.on &&
        (error ? (
          <FieldNote error>{error}</FieldNote>
        ) : state.paidOff !== undefined ? (
          <FieldNote>
            {t('installments.paidOff', {
              date: formatShortDate(state.paidOff, today, money.locale),
            })}
          </FieldNote>
        ) : (
          summary && <FieldNote>{summary}</FieldNote>
        ))}

      <Sheet
        open={choosingFirst}
        title={t('installments.first')}
        doneLabel={t('nav.done')}
        onClose={() => {
          setChoosingFirst(false)
        }}
      >
        <List inset>
          {Array.from({ length: mostDeferred + 1 }, (_, deferred) => (
            <ChoiceRow
              key={deferred}
              role="radio"
              title={
                deferred === 0
                  ? t('installments.firstNext')
                  : t('installments.firstLater', { count: deferred })
              }
              checked={state.deferred === deferred}
              onToggle={() => {
                set({ deferred })
                setChoosingFirst(false)
              }}
            />
          ))}
        </List>
      </Sheet>
      {left !== null && (
        <ActionSheet
          open={payingOff}
          title={t('installments.payOffTitle')}
          message={t('installments.payOffBody', { amount: of(left) })}
          cancelLabel={t('nav.cancel')}
          actions={[
            {
              label: t('installments.payOffAction'),
              onSelect: () => {
                set({ paidOff: today })
              },
            },
          ]}
          onClose={() => {
            setPayingOff(false)
          }}
        />
      )}
    </div>
  )
}

/** One choice of months: filled in `brand` when chosen, like a selected tab (DL-COL-03). */
function Chip({
  selected,
  wide,
  error,
  onClick,
  children,
}: {
  selected: boolean
  wide?: boolean
  error?: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-invalid={error ? true : undefined}
      onClick={onClick}
      className={`min-h-11 rounded-[0.625rem] text-[0.9375rem] tabular-nums transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand motion-reduce:transition-none ${
        wide ? 'col-span-2' : ''
      } ${selected ? 'bg-brand font-semibold text-on-brand' : 'bg-surface text-text'}`}
    >
      {children}
    </button>
  )
}
