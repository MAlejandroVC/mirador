import { type GoalRecord, goalKinds } from '@repo/api'
import {
  addDays,
  amountInput,
  formatDecimal,
  fractionDigits,
  type Goal,
  type GoalKind,
  parseAmount,
  parseDecimal,
  percentDecimals,
} from '@repo/core'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionSheet } from '../../components/ui/action-sheet'
import { AmountField } from '../../components/ui/amount-field'
import { ChoiceRow } from '../../components/ui/choice-row'
import { DateRow } from '../../components/ui/date-field'
import { FieldNote, FieldRow, FieldRows, MoneyRow } from '../../components/ui/field-row'
import { IconTile } from '../../components/ui/icon-tile'
import { List } from '../../components/ui/list'
import { NameField } from '../../components/ui/name-field'
import { PickerRow } from '../../components/ui/picker-row'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet } from '../../components/ui/sheet'
import { SubmitButton } from '../../components/ui/submit-button'
import { useSubmit } from '../../components/ui/use-submit'
import { useMoney } from '../../lib/format'
import { markNew } from '../../lib/motion'
import { newId, useSaveRecords } from '../wallets/use-ledger'
import { walletIconComponents } from '../wallets/wallet-look'
import { useBudgetWords } from './budget-words'
import { goalIcons } from './goal-icons'
import { GoalTile } from './parts'
import { goalChange } from './records'
import { type Budget, fundWith } from './use-budget'

export type GoalSheetMode = { kind: 'new' } | { kind: 'edit'; goal: Goal & Partial<GoalRecord> }

/** What the form holds while the person fills it in. */
interface Draft {
  name: string
  kind: GoalKind
  target: string
  /** BUD-21, BUD-22: reach it by a date, or put in an amount each month. */
  pace: 'date' | 'month'
  by: string
  perMonth: string
  saved: string
  walletIds: string[]
  /** BUD-27: an emergency fund's months of Commitments and Needs. */
  months: number
  /** BUD-60, BUD-63: a purchase's date, its buffer and its financing. */
  date: string
  buffer: 'amount' | 'months'
  bufferAmount: string
  bufferMonths: number
  rate: string
  payments: string
}

const monthChoices = [3, 6, 12] as const

// BUD-20 to BUD-22, BUD-25 to BUD-28, BUD-60: a goal in a sheet (DL-CMP-08). Its kind
// decides what it asks; everything that can be guessed is filled in (DL-PAT-02), and
// the result shows as it is typed: what it needs each month and whether the left over
// covers it after the goals above it (BUD-23, BUD-24).
export function GoalSheet({
  open,
  mode,
  budget,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: GoalSheetMode
  budget: Budget
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const { t } = useTranslation()
  const requestCloseRef = useRef<(() => void) | null>(null)
  return (
    <Sheet
      open={open}
      title={mode.kind === 'new' ? t('budget.goal.newTitle') : t('budget.goal.editTitle')}
      cancelLabel={t('nav.cancel')}
      onClose={() => {
        ;(requestCloseRef.current ?? onClose)()
      }}
    >
      {open && (
        <GoalForm
          mode={mode}
          budget={budget}
          onClose={onClose}
          requestCloseRef={requestCloseRef}
          {...(onSaved ? { onSaved } : {})}
        />
      )}
    </Sheet>
  )
}

function draftOf(mode: GoalSheetMode, currency: string, locale: string, today: string): Draft {
  const money = (minor: number | undefined) =>
    minor === undefined ? '' : amountInput(minor, currency, locale)
  if (mode.kind === 'new')
    return {
      name: '',
      kind: 'save',
      target: '',
      pace: 'date',
      by: '',
      perMonth: '',
      saved: '',
      walletIds: [],
      months: 6,
      date: addDays(today, 42),
      buffer: 'months',
      bufferAmount: '',
      bufferMonths: 3,
      rate: '',
      payments: '',
    }
  const goal = mode.goal
  return {
    name: goal.name,
    kind: goal.kind,
    target: money(goal.target),
    pace: goal.perMonth !== undefined ? 'month' : 'date',
    by: goal.by ?? '',
    perMonth: money(goal.perMonth),
    saved: goal.saved === 0 ? '' : money(goal.saved),
    walletIds: [...goal.walletIds],
    months: goal.months ?? 6,
    date: goal.purchase?.date ?? addDays(today, 42),
    buffer: goal.purchase?.bufferMonths === undefined && goal.purchase ? 'amount' : 'months',
    // A buffer kept in months stores no amount, so switching to one starts empty.
    bufferAmount: goal.purchase?.bufferMonths === undefined ? money(goal.purchase?.buffer) : '',
    bufferMonths: goal.purchase?.bufferMonths ?? 3,
    rate:
      goal.purchase?.rate === undefined
        ? ''
        : formatDecimal(goal.purchase.rate, percentDecimals, locale),
    payments: goal.purchase?.payments === undefined ? '' : String(goal.purchase.payments),
  }
}

function GoalForm({
  mode,
  budget,
  onClose,
  requestCloseRef,
  onSaved,
}: {
  mode: GoalSheetMode
  budget: Budget
  onClose: () => void
  requestCloseRef: RefObject<(() => void) | null>
  onSaved?: (id: string) => void
}) {
  const { t } = useTranslation()
  const currency = budget.context.currency
  const money = useMoney(currency)
  const words = useBudgetWords(currency, budget.today)
  const save = useSaveRecords()
  const form = useSubmit()
  const [initial] = useState(() => draftOf(mode, currency, money.locale, budget.today))
  const [draft, setDraft] = useState(initial)
  const [picking, setPicking] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch })
  }
  const amount = (text: string) => parseAmount(text, currency, money.locale)
  const decimals = fractionDigits(currency)
  const parts = money.parts({ minor: 0, currency })
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  // What each kind asks for (BUD-20).
  const { kind } = draft
  const afford = kind === 'afford'
  const debt = kind === 'debt'
  const emergency = kind === 'emergency'
  const target = amount(draft.target)
  const perMonth = amount(draft.perMonth)
  const saved = amount(draft.saved) ?? 0
  const pace = kind === 'invest' ? 'month' : draft.pace
  // BUD-63: a yearly rate typed as a percent, kept in hundredths of a percent.
  const rate =
    draft.rate.trim() === '' ? null : parseDecimal(draft.rate, money.locale, percentDecimals)
  const wallets = budget.ledger.wallets.filter((wallet) => wallet.active)
  const owedWallets = wallets.filter(
    (wallet) => budget.balances.balance([wallet.id], budget.today) < 0,
  )
  // Savings sit in what you have, so a card or a loan is offered only to pay it off.
  const haveWallets = wallets.filter(
    (wallet) => !owedWallets.includes(wallet) || draft.walletIds.includes(wallet.id),
  )

  const checks = {
    name: draft.name.trim().length > 0,
    target: afford || emergency || kind === 'invest' ? true : target !== null && target > 0,
    by: afford || pace === 'month' || (draft.by !== '' && draft.by > budget.today),
    perMonth: afford || pace === 'date' || (perMonth !== null && perMonth > 0),
    wallet: afford ? draft.walletIds.length > 0 : debt ? draft.walletIds.length === 1 : true,
    date: !afford || draft.date > budget.today,
  }
  const complete = Object.values(checks).every(Boolean)

  // The goal as it would be saved, for the live result and the record.
  const start = mode.kind === 'edit' ? mode.goal.start : budget.today
  const order =
    mode.kind === 'edit'
      ? mode.goal.order
      : Math.max(-1, ...budget.goals.map((goal) => goal.order)) + 1
  const record: GoalRecord = {
    name: draft.name.trim(),
    kind,
    saved: debt || afford ? 0 : saved,
    walletIds: draft.walletIds,
    start,
    order,
    ...(!afford && !emergency && target !== null && target > 0 ? { target } : {}),
    ...(!afford && pace === 'date' && draft.by ? { by: draft.by } : {}),
    ...(!afford && pace === 'month' && perMonth !== null ? { perMonth } : {}),
    ...(emergency ? { months: draft.months } : {}),
    ...(afford
      ? {
          purchase: {
            date: draft.date,
            buffer: draft.buffer === 'amount' ? (amount(draft.bufferAmount) ?? 0) : 0,
            ...(draft.buffer === 'months' ? { bufferMonths: draft.bufferMonths } : {}),
            ...(rate !== null ? { rate: Math.min(rate, 20_000) } : {}),
            ...(Number(draft.payments) > 0 ? { payments: Math.round(Number(draft.payments)) } : {}),
          },
        }
      : {}),
    ...(mode.kind === 'edit' && mode.goal.paused ? { paused: true } : {}),
    ...(mode.kind === 'edit' && mode.goal.done ? { done: mode.goal.done } : {}),
    ...(mode.kind === 'edit' && mode.goal.createdAt
      ? { createdAt: mode.goal.createdAt }
      : { createdAt: new Date().toISOString() }),
  }
  const id = mode.kind === 'edit' ? mode.goal.id : 'draft'

  // BUD-21 to BUD-24: the goal among the others, funded in their order.
  const others = budget.goals.filter((goal) => goal.id !== id)
  const result =
    complete && !afford
      ? fundWith(budget, budget.month.leftOver, [...others, { ...record, id }]).goals.find(
          (plan) => plan.goal.id === id,
        )
      : undefined

  function submit() {
    const goalId = mode.kind === 'edit' ? mode.goal.id : newId()
    save.mutate([goalChange(goalId, record)], {
      onSuccess: () => {
        if (mode.kind === 'new') markNew(goalId)
        onSaved?.(goalId)
        form.finish(onClose)
      },
    })
  }

  // DL-CMP-08: closing with unsaved changes asks first.
  useEffect(() => {
    requestCloseRef.current = () => {
      if (dirty) setDiscarding(true)
      else onClose()
    }
    return () => {
      requestCloseRef.current = null
    }
  }, [dirty, onClose, requestCloseRef])

  const walletNames = draft.walletIds
    .map((walletId) => wallets.find((wallet) => wallet.id === walletId)?.name)
    .filter((name): name is string => name !== undefined)

  return (
    <>
      <NameField
        tile={<GoalTile kind={kind} size="large" />}
        label={t('budget.goal.name')}
        placeholder={t(`budget.goal.placeholders.${kind}`)}
        value={draft.name}
        maxLength={80}
        error={form.tried && !checks.name ? t('budget.goal.nameMissing') : null}
        onChange={(name) => {
          set({ name })
        }}
      />

      {/* BUD-20: the five kinds, each with its own icon; icons line up even when a name
          takes two lines. */}
      <section className="flex flex-col gap-1.5">
        <h3 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
          {t('budget.goal.kind')}
        </h3>
        <div
          role="radiogroup"
          aria-label={t('budget.goal.kind')}
          className="grid grid-cols-3 gap-1 rounded-2xl bg-inset p-1.5"
        >
          {goalKinds.map((option) => {
            const checked = kind === option
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => {
                  const patch: Partial<Draft> = { kind: option, walletIds: [] }
                  set(patch)
                }}
                className={`flex min-h-[4.75rem] flex-col items-center justify-start gap-1.5 rounded-xl px-1 py-2 focus-visible:outline-2 focus-visible:outline-brand ${
                  checked ? 'bg-surface shadow-[0_1px_3px_rgb(0_0_0/14%)]' : ''
                }`}
              >
                <IconTile icon={goalIcons[option]} color="sun" />
                <span
                  className={`text-center text-[0.8125rem] leading-tight ${checked ? 'font-semibold text-text' : 'text-text-muted'}`}
                >
                  {t(`budget.goal.kinds.${option}`)}
                </span>
              </button>
            )
          })}
        </div>
        <FieldNote>{t(`budget.goal.kindHints.${kind}`)}</FieldNote>
      </section>

      {debt && (
        <FieldRows
          note={
            form.tried && !checks.wallet ? (
              <FieldNote error>{t('budget.goal.debtMissing')}</FieldNote>
            ) : (
              <FieldNote>{t('budget.goal.debtHint')}</FieldNote>
            )
          }
        >
          <PickerRow
            label={t('budget.goal.debtWallet')}
            value={walletNames[0] ?? t('pickers.choose')}
            error={form.tried && !checks.wallet}
            onClick={() => {
              setPicking(true)
            }}
          />
        </FieldRows>
      )}

      {!afford && !emergency && (
        <AmountField
          label={
            kind === 'invest'
              ? t('budget.goal.targetOptional')
              : debt
                ? t('budget.goal.debtTarget')
                : t('budget.goal.target')
          }
          value={draft.target}
          onChange={(value) => {
            set({ target: value })
          }}
          locale={money.locale}
          decimals={decimals}
          prefix={parts.prefix.trim()}
          suffix={parts.suffix.trim()}
          error={form.tried && !checks.target ? t('budget.amountMissing') : null}
        />
      )}

      {emergency && (
        <section className="flex flex-col gap-1.5">
          <SegmentedControl
            label={t('budget.goal.months')}
            options={monthChoices.map((count) => ({
              value: String(count),
              label: t('budget.goal.monthsOption', { count }),
            }))}
            value={String(draft.months)}
            onChange={(value) => {
              set({ months: Number(value) })
            }}
          />
          <FieldNote>
            {t('budget.goal.monthsHint', {
              amount: words.text(draft.months * budget.essentials),
              count: draft.months,
            })}
          </FieldNote>
        </section>
      )}

      {!afford && (
        <section className="flex flex-col gap-1.5">
          {kind !== 'invest' && (
            <SegmentedControl
              label={t('budget.goal.pace')}
              options={[
                { value: 'date', label: t('budget.goal.byDate') },
                { value: 'month', label: t('budget.goal.perMonth') },
              ]}
              value={pace}
              onChange={(value) => {
                set({ pace: value })
              }}
            />
          )}
          <FieldRows
            note={
              form.tried && !(checks.by && checks.perMonth) ? (
                <FieldNote error>
                  {pace === 'date' ? t('budget.goal.byMissing') : t('budget.goal.perMonthMissing')}
                </FieldNote>
              ) : null
            }
          >
            {pace === 'date' ? (
              <DateRow
                label={t('budget.goal.by')}
                value={draft.by}
                min={addDays(budget.today, 1)}
                error={form.tried && !checks.by}
                onChange={(by) => {
                  set({ by })
                }}
              />
            ) : (
              <MoneyRow
                label={t('budget.goal.eachMonth')}
                value={draft.perMonth}
                onChange={(value) => {
                  set({ perMonth: value })
                }}
                locale={money.locale}
                decimals={decimals}
                error={form.tried && !checks.perMonth}
              />
            )}
            {!debt && (
              <MoneyRow
                label={t('budget.goal.saved')}
                value={draft.saved}
                onChange={(value) => {
                  set({ saved: value })
                }}
                locale={money.locale}
                decimals={decimals}
              />
            )}
            {!debt && (
              <PickerRow
                label={t('budget.goal.follow')}
                value={walletNames.length > 0 ? walletNames.join(', ') : t('budget.goal.noWallet')}
                error={false}
                onClick={() => {
                  setPicking(true)
                }}
              />
            )}
          </FieldRows>
          {!debt && (
            <FieldNote>
              {walletNames.length > 0
                ? t('budget.goal.followHint', { wallets: walletNames.join(', ') })
                : t('budget.goal.addHint')}
            </FieldNote>
          )}
        </section>
      )}

      {afford && (
        <>
          <FieldRows>
            <DateRow
              label={t('budget.goal.purchaseDate')}
              value={draft.date}
              min={addDays(budget.today, 1)}
              error={form.tried && !checks.date}
              onChange={(date) => {
                set({ date })
              }}
            />
            <PickerRow
              label={t('budget.goal.savingsFrom')}
              value={walletNames.length > 0 ? walletNames.join(', ') : t('pickers.choose')}
              error={form.tried && !checks.wallet}
              onClick={() => {
                setPicking(true)
              }}
            />
          </FieldRows>
          <section className="flex flex-col gap-1.5">
            <h3 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
              {t('budget.goal.buffer')}
            </h3>
            <SegmentedControl
              label={t('budget.goal.buffer')}
              options={[
                { value: 'months', label: t('budget.goal.bufferMonths') },
                { value: 'amount', label: t('budget.goal.bufferAmount') },
              ]}
              value={draft.buffer}
              onChange={(value) => {
                set({ buffer: value })
              }}
            />
            {draft.buffer === 'months' ? (
              <SegmentedControl
                label={t('budget.goal.months')}
                options={monthChoices.map((count) => ({
                  value: String(count),
                  label: t('budget.goal.monthsOption', { count }),
                }))}
                value={String(draft.bufferMonths)}
                onChange={(value) => {
                  set({ bufferMonths: Number(value) })
                }}
              />
            ) : (
              <FieldRows>
                <MoneyRow
                  label={t('budget.goal.keep')}
                  value={draft.bufferAmount}
                  onChange={(value) => {
                    set({ bufferAmount: value })
                  }}
                  locale={money.locale}
                  decimals={decimals}
                />
              </FieldRows>
            )}
            <FieldNote>
              {draft.buffer === 'months'
                ? t('budget.goal.bufferHint', {
                    amount: words.text(draft.bufferMonths * budget.essentials),
                  })
                : t('budget.goal.bufferAmountHint')}
            </FieldNote>
          </section>
          <section className="flex flex-col gap-1.5">
            <h3 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
              {t('budget.goal.financing')}
            </h3>
            <FieldRows note={<FieldNote>{t('budget.goal.financingHint')}</FieldNote>}>
              <FieldRow
                label={t('budget.goal.rate')}
                value={draft.rate}
                inputMode="decimal"
                placeholder="0"
                suffix="%"
                onChange={(event) => {
                  set({ rate: event.target.value })
                }}
              />
              <FieldRow
                label={t('budget.goal.payments')}
                value={draft.payments}
                inputMode="numeric"
                placeholder="0"
                onChange={(event) => {
                  set({ payments: event.target.value.replace(/\D/g, '').slice(0, 3) })
                }}
              />
            </FieldRows>
          </section>
        </>
      )}

      {/* BUD-21 to BUD-24: what it needs each month, and whether the left over covers it. */}
      {result && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 rounded-2xl bg-inset p-4">
            <GoalTile kind={kind} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[0.9375rem] font-semibold text-text">
                {t('budget.goal.result', { amount: words.text(result.need) })}
              </span>
              <span className="text-[0.8125rem] text-text-muted">
                {result.funding === 'funded' || result.funding === 'reached'
                  ? result.projected && pace === 'month' && result.target !== null
                    ? t('budget.goal.fundedBy', { date: words.monthYear(result.projected) })
                    : t('budget.goal.funded')
                  : result.funding === 'partly'
                    ? t('budget.goal.partly', {
                        amount: words.text(result.funded),
                        date: result.projected ? words.monthYear(result.projected) : '–',
                      })
                    : t('budget.goal.unfunded')}
              </span>
            </div>
          </div>
          <FieldNote>{t('budget.goal.orderHint')}</FieldNote>
        </div>
      )}

      <SubmitButton
        button={form.button}
        done={form.done}
        pending={save.isPending}
        before={
          save.isError && (
            <p className="px-2 text-center text-[0.8125rem] text-warning">
              {t('budget.saveFailed')}
            </p>
          )
        }
        onClick={() => {
          form.submit(complete, submit)
        }}
      >
        {t('budget.save')}
      </SubmitButton>

      <Sheet
        open={picking}
        title={
          debt
            ? t('budget.goal.debtWallet')
            : afford
              ? t('budget.goal.savingsFrom')
              : t('budget.goal.follow')
        }
        doneLabel={t('nav.done')}
        onClose={() => {
          setPicking(false)
        }}
      >
        {picking && (
          <List inset>
            {(debt ? owedWallets : haveWallets).map((wallet) => (
              <ChoiceRow
                key={wallet.id}
                role={debt ? 'radio' : 'checkbox'}
                leading={<IconTile icon={walletIconComponents[wallet.icon]} color={wallet.color} />}
                title={wallet.name}
                subtitle={words.text(budget.balances.balance([wallet.id], budget.today))}
                checked={draft.walletIds.includes(wallet.id)}
                onToggle={() => {
                  if (debt) {
                    // BUD-28: the debt's target starts as what is owed today.
                    const owed = -budget.balances.balance([wallet.id], budget.today)
                    set({
                      walletIds: [wallet.id],
                      ...(draft.target === '' || draft.walletIds.length > 0
                        ? { target: amountInput(owed, currency, money.locale) }
                        : {}),
                      ...(draft.name.trim() === '' ? { name: wallet.name } : {}),
                    })
                    setPicking(false)
                  } else
                    set({
                      walletIds: draft.walletIds.includes(wallet.id)
                        ? draft.walletIds.filter((item) => item !== wallet.id)
                        : [...draft.walletIds, wallet.id],
                    })
                }}
              />
            ))}
            {debt && owedWallets.length === 0 && (
              <li className="px-4 py-3 text-[0.9375rem] text-text-muted">
                {t('budget.goal.noDebts')}
              </li>
            )}
          </List>
        )}
      </Sheet>

      <ActionSheet
        open={discarding}
        title={t('budget.goal.discardTitle')}
        message={t('budget.goal.discardMessage')}
        actions={[
          {
            label: t('budget.goal.discard'),
            tone: 'danger',
            onSelect: () => {
              setDiscarding(false)
              onClose()
            },
          },
        ]}
        cancelLabel={t('budget.goal.keepEditing')}
        onClose={() => {
          setDiscarding(false)
        }}
      />
    </>
  )
}
