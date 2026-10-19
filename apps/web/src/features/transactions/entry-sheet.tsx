import {
  importBatchRecord,
  importBatchRecordType,
  payeeRecord,
  payeeRecordType,
  recurringRecord,
  recurringRecordType,
  tagRecord,
  tagRecordType,
  transactionRecord,
} from '@repo/api'
import {
  amountText,
  applyRate,
  decimalInput,
  type EntryDraft,
  entryDraft,
  entryFields,
  type EntryType,
  fractionDigits,
  lastUsedWallet,
  nextTagColor,
  parseAmount,
  type Payee,
  payeeMemory,
  parseDecimal,
  pickableWallets,
  rateBetween,
  rateDecimals,
  rateInUse,
  type Recurring,
  recurringDraft,
  recurringFields,
  type Repeat,
  type Schedule,
  startingWallet,
  type Tag,
  toCalendarDate,
  type Transaction,
  type TransactionSource,
  walletBalances,
  activePlans,
} from '@repo/core'
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionSheet } from '../../components/ui/action-sheet'
import { AmountField } from '../../components/ui/amount-field'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { DateRow } from '../../components/ui/date-field'
import { FieldNote, FieldRow, FieldRows, MoneyRow } from '../../components/ui/field-row'
import { Fold } from '../../components/ui/fold'
import { CheckIcon } from '../../components/ui/icons'
import { PickerRow } from '../../components/ui/picker-row'
import { List } from '../../components/ui/list'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet } from '../../components/ui/sheet'
import { SubmitButton } from '../../components/ui/submit-button'
import { useSubmit } from '../../components/ui/use-submit'
import { useUndo } from '../../components/ui/use-undo'
import { useMoney } from '../../lib/format'
import { markNew } from '../../lib/motion'
import { CategoryPicker } from '../categories/category-picker'
import { CategoryTile } from '../categories/category-tile'
import { PayeePicker } from '../categories/payee-picker'
import { TagPicker } from '../categories/tag-picker'
import { EndsSheet } from '../recurring/ends-sheet'
import { type Ends, endsLabel, repeatLabel } from '../recurring/labels'
import { RepeatSheet } from '../recurring/repeat-sheet'
import { recurringChange } from '../recurring/use-post-recurring'
import {
  balanceEntries,
  type Ledger,
  newId,
  type RecordChange,
  recordBody,
  transactionBody,
  useLedger,
  useSaveRecords,
} from '../wallets/use-ledger'
import { InstallmentsFields } from './installments-fields'
import { chosenMonths, initialInstallments, type InstallmentState } from './installments-state'
import { WalletPicker } from './wallet-picker'

/**
 * What the sheet is for: a new transaction, which may start filled in or repeating;
 * changing one that was saved; changing a recurring transaction (TXN-09); or checking
 * one date of a recurring transaction that asks first (TXN-10).
 */
export type EntryMode =
  | {
      kind: 'new'
      source: TransactionSource
      seed?: Partial<EntryDraft>
      repeat?: Repeat
      /** IMP-33: a row an import left for later, added by hand into that import. */
      fromImport?: { batchId: string; line: number }
    }
  | { kind: 'edit'; transaction: Transaction & { kind: EntryType } }
  | { kind: 'series'; recurring: Recurring }
  | { kind: 'due'; recurring: Recurring; date: string }

function modeType(mode: EntryMode): EntryType {
  switch (mode.kind) {
    case 'new':
      return mode.seed?.type ?? 'expense'
    case 'edit':
      return mode.transaction.kind
    default:
      return mode.recurring.kind
  }
}

// TXN-01: adding or changing an expense, an income or a transfer in a sheet
// (DL-CMP-08). The same sheet is quick-add's manual entry (WID-03, WID-07): only the
// amount is needed, since the wallet, the type and the date start filled in.
export function EntrySheet({
  open,
  mode,
  onClose,
  onDelete,
  onOpenSeries,
  empty,
}: {
  open: boolean
  mode: EntryMode
  onClose: () => void
  onDelete?: (transaction: Transaction) => void
  /** Opens the recurring transaction a saved one came from (TXN-09). */
  onOpenSeries?: (recurring: Recurring) => void
  /** Shown instead of the form while there is no wallet to put a transaction in. */
  empty?: ReactNode
}) {
  const { t } = useTranslation()
  const { data: ledger } = useLedger()
  const initialType = modeType(mode)
  const [type, setType] = useState<EntryType>(initialType)
  // A fresh form each time it opens, and after "Save & new".
  const [round, setRound] = useState(0)
  const [seed, setSeed] = useState<Partial<EntryDraft> | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setType(initialType)
      setSeed(null)
      setRound(round + 1)
    }
  }
  // The form decides whether closing needs to ask first (DL-CMP-08).
  const requestCloseRef = useRef<(() => void) | null>(null)
  const noWallets = ledger !== undefined && pickableWallets(ledger.wallets).length === 0
  const title =
    mode.kind === 'edit'
      ? t(`transactions.editTitle.${type}`)
      : mode.kind === 'series'
        ? t(`recurring.editTitle.${type}`)
        : t(`transactions.newTitle.${type}`)

  return (
    <Sheet
      open={open}
      title={noWallets && mode.kind === 'new' ? t('quickAdd.title') : title}
      cancelLabel={t('nav.cancel')}
      onClose={() => {
        ;(requestCloseRef.current ?? onClose)()
      }}
    >
      {open &&
        ledger &&
        (noWallets && mode.kind === 'new' ? (
          empty
        ) : (
          <EntryForm
            key={round}
            ledger={ledger}
            mode={mode}
            type={type}
            onType={setType}
            seed={seed}
            requestCloseRef={requestCloseRef}
            onClose={onClose}
            onSavedAndNew={(next) => {
              setSeed(next)
              setRound(round + 1)
            }}
            {...(onDelete ? { onDelete } : {})}
            {...(onOpenSeries ? { onOpenSeries } : {})}
          />
        ))}
    </Sheet>
  )
}

function EntryForm({
  ledger,
  mode,
  type,
  onType,
  seed,
  requestCloseRef,
  onClose,
  onSavedAndNew,
  onDelete,
  onOpenSeries,
}: {
  ledger: Ledger
  mode: EntryMode
  type: EntryType
  onType: (type: EntryType) => void
  seed: Partial<EntryDraft> | null
  requestCloseRef: RefObject<(() => void) | null>
  onClose: () => void
  onSavedAndNew: (seed: Partial<EntryDraft>) => void
  onDelete?: (transaction: Transaction) => void
  onOpenSeries?: (recurring: Recurring) => void
}) {
  const { t } = useTranslation()
  const undo = useUndo()
  const money = useMoney(ledger.defaultCurrency)
  const locale = money.locale
  const save = useSaveRecords()
  const form = useSubmit()
  const today = toCalendarDate(new Date())
  const byId = new Map(ledger.wallets.map((wallet) => [wallet.id, wallet]))
  const pickable = pickableWallets(ledger.wallets)

  // WID-03, WAL-24: a new one starts in the default wallet, or else the last one used,
  // or else the first active wallet; today; an expense.
  const initial: EntryDraft =
    mode.kind === 'edit'
      ? entryDraft(mode.transaction)
      : mode.kind === 'series'
        ? recurringDraft(mode.recurring)
        : mode.kind === 'due'
          ? { ...recurringDraft(mode.recurring), date: mode.date }
          : {
              type: 'expense',
              amount: 0,
              walletId:
                (
                  startingWallet(
                    ledger.wallets,
                    ledger.defaultWalletId,
                    lastUsedWallet(ledger.transactions),
                  ) ?? pickable[0]
                )?.id ?? '',
              date: today,
              ...mode.seed,
              ...seed,
            }
  const [walletId, setWalletId] = useState<string | null>(initial.walletId || null)
  const [toWalletId, setToWalletId] = useState<string | null>(initial.toWalletId ?? null)
  const from = walletId === null ? undefined : byId.get(walletId)
  const to = toWalletId === null ? undefined : byId.get(toWalletId)
  // TXN-31: with interest, the amount typed is the price; the card charges more.
  const typedAmount = initial.installments?.price ?? initial.amount
  const [text, setText] = useState(
    typedAmount > 0 && (from ?? to)
      ? amountText(typedAmount, (from ?? to)?.currency ?? ledger.defaultCurrency, locale)
      : '',
  )
  const [date, setDate] = useState(initial.date)
  const [note, setNote] = useState(initial.note ?? '')
  const [excluded, setExcluded] = useState(initial.excludeFromBudget ?? false)
  // TXN-05: between currencies, what arrived and the rate; the one typed last decides.
  const [receivedText, setReceivedText] = useState(
    initial.toAmount !== undefined && to && from && to.currency !== from.currency
      ? amountText(initial.toAmount, to.currency, locale)
      : '',
  )
  const [rateText, setRateText] = useState(
    initial.rate === undefined ? '' : decimalInput(initial.rate, rateDecimals, locale),
  )
  // CAT-20, TXN-15, TXN fields: the category, tags and payee. Tags and payees made here
  // are saved with the transaction, so cancelling leaves nothing behind (CAT-21).
  // CAT-05: one saved before categories existed opens as Uncategorized.
  const [categoryId, setCategoryId] = useState<string | null>(
    initial.categoryId ??
      (mode.kind === 'edit'
        ? (ledger.categories.find((item) => item.systemKey === 'uncategorized')?.id ?? null)
        : null),
  )
  const [tagIds, setTagIds] = useState<string[]>(initial.tagIds ?? [])
  const [payeeId, setPayeeId] = useState<string | null>(initial.payeeId ?? null)
  const [newTags, setNewTags] = useState<Tag[]>([])
  const [newPayees, setNewPayees] = useState<Payee[]>([])
  const [walletTouched, setWalletTouched] = useState(mode.kind === 'edit')
  const [choosing, setChoosing] = useState<
    'from' | 'to' | 'category' | 'tags' | 'payee' | 'repeat' | 'ends' | null
  >(null)
  // TXN-09: a new transaction can repeat; a recurring one being changed always does.
  const series = mode.kind === 'series' ? mode.recurring : null
  const [repeat, setRepeat] = useState<Repeat | null>(
    series?.every ?? (mode.kind === 'new' ? (mode.repeat ?? null) : null),
  )
  const [ends, setEnds] = useState<Ends>(
    series?.until !== undefined
      ? { kind: 'on', date: series.until }
      : series?.times !== undefined
        ? { kind: 'after', times: series.times }
        : { kind: 'never' },
  )
  const [ask, setAsk] = useState(series?.ask ?? false)
  // TXN-30: paying a purchase in installments.
  const [plan, setPlan] = useState<InstallmentState>(() =>
    initialInstallments(
      initial.installments,
      initial.amount,
      from?.currency ?? ledger.defaultCurrency,
      locale,
    ),
  )
  const [discarding, setDiscarding] = useState(false)
  const [savedOne, setSavedOne] = useState(false)

  const transfer = type === 'transfer'
  const canRepeat = mode.kind === 'new' || mode.kind === 'series'
  const repeating = canRepeat && repeat !== null
  // The recurring transaction a saved one came from, which opens from its Repeat row.
  const origin =
    mode.kind === 'edit' && mode.transaction.recurringId !== undefined
      ? ledger.recurring.find((item) => item.id === mode.transaction.recurringId)
      : undefined
  // TXN-30: any expense made once can be paid in installments. On a credit card with
  // its statement dates set up (WAL-16), they follow its statements.
  const installable =
    type === 'expense' && !repeating && (mode.kind === 'new' || mode.kind === 'edit')
  const credit = installable && from?.features.includes('creditLimit') ? from.credit : undefined
  const inInstallments = installable && from !== undefined && plan.on
  const allTags = [...ledger.tags, ...newTags]
  const allPayees = [...ledger.payees, ...newPayees]
  // A category of the other kind doesn't carry over when the type changes (CAT-02).
  const chosenCategory =
    categoryId === null ? undefined : ledger.categories.find((item) => item.id === categoryId)
  const category =
    !transfer && chosenCategory && (chosenCategory.kind === type || chosenCategory.kind === 'any')
      ? chosenCategory
      : undefined
  const payee = payeeId === null ? undefined : allPayees.find((item) => item.id === payeeId)
  const chosenTags = tagIds.flatMap((id) => allTags.find((tag) => tag.id === id) ?? [])
  const exchange = transfer && from && to && from.currency !== to.currency ? { from, to } : null
  const crossCurrency = exchange !== null
  const magnitude = from ? parseAmount(text, from.currency, locale) : null
  const received = to ? parseAmount(receivedText, to.currency, locale) : null
  const rate = parseDecimal(rateText, locale, rateDecimals)
  const months = chosenMonths(plan)
  const payment = from ? parseAmount(plan.paymentText, from.currency, locale) : null
  // TXN-31: with interest, the card charges the monthly payment the bank quotes, times
  // the months; interest-free, the price.
  const charged =
    inInstallments && plan.interest && payment !== null && months !== null
      ? payment * months
      : magnitude

  // Keeps what arrived and the rate in step: change one, the other follows.
  function fromRate(nextRate: number | null, amount = magnitude) {
    if (!from || !to || nextRate === null || nextRate === 0 || amount === null) return
    setReceivedText(
      amountText(applyRate(amount, from.currency, to.currency, nextRate), to.currency, locale),
    )
  }
  function fromReceived(nextReceived: number | null, amount = magnitude) {
    if (!from || !to || nextReceived === null || amount === null) return
    const next = rateBetween(amount, from.currency, nextReceived, to.currency)
    if (next !== null) setRateText(decimalInput(next, rateDecimals, locale))
  }
  // A destination in another currency starts from the rate in use on the date (SYS-05).
  function chooseTo(id: string) {
    setToWalletId(id)
    const next = byId.get(id)
    if (!from || !next || next.currency === from.currency) return
    const inUse = rateInUse(from.currency, next.currency, ledger.rates, date)
    if (!inUse) return
    const units = inUse.inverse
      ? rateBetween(inUse.rate.rate, next.currency, 10 ** rateDecimals, from.currency)
      : inUse.rate.rate
    if (units === null) return
    setRateText(decimalInput(units, rateDecimals, locale))
    if (magnitude !== null)
      setReceivedText(
        amountText(
          applyRate(magnitude, from.currency, next.currency, units),
          next.currency,
          locale,
        ),
      )
  }

  // TXN-02, DL-PAT-05: what is missing, said where it is, only after Save is tapped.
  const amountError = magnitude === null || magnitude === 0 ? t('transactions.amountMissing') : null
  // WID-03: an expense or income needs its category.
  // WID-03: expenses and income need a category; one edited from before categories
  // existed may keep having none.
  const categoryError =
    transfer || category || (mode.kind === 'edit' && initial.categoryId === undefined)
      ? null
      : t('transactions.categoryMissing')
  const walletError = from ? null : t('transactions.walletMissing')
  const toError = transfer && !to ? t('transactions.toMissing') : null
  const receivedError =
    crossCurrency && (received === null || received === 0)
      ? t('transactions.receivedMissing')
      : null
  // A repeating one may start later; one made once has happened by now.
  const dateError = !date
    ? t('wallets.transactions.dateMissing')
    : date > today && !repeating
      ? t('wallets.transactions.dateFuture')
      : null
  const endsError =
    repeating && ends.kind === 'on' && ends.date < date ? t('recurring.endsBeforeStart') : null
  const monthsError = inInstallments && months === null
  const paymentError =
    inInstallments && plan.interest
      ? payment === null || payment === 0
        ? t('installments.paymentMissing')
        : months !== null && magnitude !== null && payment * months < magnitude
          ? t('installments.paymentLow')
          : null
      : null
  const complete =
    [
      amountError,
      categoryError,
      walletError,
      toError,
      receivedError,
      dateError,
      endsError,
      paymentError,
    ].every((error) => error === null) && !monthsError

  const draft = (): EntryDraft | null => {
    if (!from || magnitude === null || charged === null) return null
    return {
      type,
      amount: charged,
      walletId: from.id,
      date,
      note,
      ...(transfer && to
        ? {
            toWalletId: to.id,
            toAmount: crossCurrency ? (received ?? 0) : magnitude,
            ...(crossCurrency && rate !== null && rate > 0 ? { rate } : {}),
          }
        : {}),
      ...(!transfer && category ? { categoryId: category.id } : {}),
      ...(!transfer && chosenTags.length > 0 ? { tagIds: chosenTags.map((tag) => tag.id) } : {}),
      ...(!transfer && payee ? { payeeId: payee.id } : {}),
      ...(!transfer && excluded ? { excludeFromBudget: true } : {}),
      ...(inInstallments && months !== null
        ? {
            installments: {
              months,
              ...(plan.interest ? { price: magnitude } : {}),
              ...(plan.deferred > 0 ? { deferred: plan.deferred } : {}),
              ...(plan.paidOff !== undefined ? { paidOff: plan.paidOff } : {}),
            },
          }
        : {}),
    }
  }
  const schedule = (): Schedule | null =>
    repeat === null
      ? null
      : {
          every: repeat,
          ...(ends.kind === 'on' ? { until: ends.date } : {}),
          ...(ends.kind === 'after' ? { times: ends.times } : {}),
          ...(ask ? { ask: true } : {}),
        }

  // DL-CMP-08: anything changed since the sheet opened asks before it is thrown away.
  const [initialReceived] = useState(receivedText)
  const [initialRepeat] = useState(() => JSON.stringify([repeat, ends, ask, plan]))
  const snapshot = (values: unknown[]) => JSON.stringify(values)
  const dirty =
    snapshot([
      initial.type,
      typedAmount,
      initial.walletId || null,
      initial.toWalletId ?? null,
      initial.date,
      initial.note ?? '',
      initial.excludeFromBudget ?? false,
      initialReceived,
      initial.categoryId ?? null,
      initial.tagIds ?? [],
      initial.payeeId ?? null,
    ]) !==
      snapshot([
        type,
        magnitude ?? 0,
        walletId,
        toWalletId,
        date,
        note,
        excluded,
        receivedText,
        categoryId,
        tagIds,
        payeeId,
      ]) || initialRepeat !== JSON.stringify([repeat, ends, ask, plan])

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

  function submit(andNew: boolean) {
    form.submit(complete, () => {
      const entry = draft()
      if (!entry) return
      const now = new Date().toISOString()
      // New tags and payees still in use go in the same batch (NFR-08).
      const extras = (fields: { tagIds?: string[]; payeeId?: string }): RecordChange[] => [
        ...newTags
          .filter((tag) => fields.tagIds?.includes(tag.id))
          .map(({ id: tagId, ...tag }) => ({
            id: tagId,
            body: recordBody(tagRecordType, tagRecord.parse(tag)),
          })),
        ...newPayees
          .filter((item) => item.id === fields.payeeId)
          .map(({ id: itemId, ...item }) => ({
            id: itemId,
            body: recordBody(payeeRecordType, payeeRecord.parse(item)),
          })),
      ]
      const repeats = schedule()
      let id: string
      let changes: RecordChange[]
      if (mode.kind === 'series' && repeats) {
        // TXN-09: from now on; what was added or skipped stays as it is.
        id = mode.recurring.id
        const fields = recurringFields(entry, repeats, now, mode.recurring)
        changes = [
          ...extras(fields),
          { id, body: recordBody(recurringRecordType, recurringRecord.parse(fields)) },
        ]
      } else if (mode.kind === 'new' && repeats) {
        // TXN-09: the recurring transaction, and the first one when it starts today or
        // before: it was just entered, so it counts as checked. Later dates come by
        // themselves, or ask first (TXN-10).
        const recurringId = newId()
        const started = entry.date <= today
        const fields = recurringFields(entry, repeats, now, started ? { handled: entry.date } : {})
        id = started ? newId() : recurringId
        changes = [
          ...extras(fields),
          {
            id: recurringId,
            body: recordBody(recurringRecordType, recurringRecord.parse(fields)),
          },
          ...(started
            ? [
                {
                  id,
                  body: transactionBody(
                    transactionRecord.parse({
                      ...entryFields(entry, mode.source, now),
                      recurringId,
                      occurrence: entry.date,
                    }),
                  ),
                },
              ]
            : []),
        ]
      } else if (mode.kind === 'due') {
        // TXN-10: one date of a recurring transaction, checked and added; the dates
        // before it that still waited are skipped with it.
        id = newId()
        const fields = {
          ...entryFields(entry, 'recurring', now),
          recurringId: mode.recurring.id,
          occurrence: mode.date,
        }
        changes = [
          ...extras(fields),
          { id, body: transactionBody(transactionRecord.parse(fields)) },
          recurringChange(mode.recurring, { handled: mode.date }),
        ]
      } else {
        id = mode.kind === 'edit' ? mode.transaction.id : newId()
        const fields =
          mode.kind === 'edit'
            ? {
                ...entryFields(
                  entry,
                  mode.transaction.source ?? 'manual',
                  now,
                  mode.transaction.createdAt ?? now,
                ),
                ...(mode.transaction.recurringId !== undefined
                  ? {
                      recurringId: mode.transaction.recurringId,
                      occurrence: mode.transaction.occurrence,
                    }
                  : {}),
              }
            : entryFields(entry, mode.kind === 'new' ? mode.source : 'manual', now)
        const fromImport = mode.kind === 'new' ? mode.fromImport : undefined
        const batch = fromImport && ledger.batches.find((item) => item.id === fromImport.batchId)
        changes = [
          ...extras(fields),
          {
            id,
            body: transactionBody(
              transactionRecord.parse(batch ? { ...fields, importBatchId: batch.id } : fields),
            ),
          },
          // IMP-33, IMP-35: the row is no longer waiting, and undoing the import
          // removes it with the rest.
          ...(fromImport && batch ? [fixedRow(batch, fromImport.line)] : []),
        ]
      }
      save.mutate(changes, {
        onSuccess: () => {
          markNew(id)
          if (!andNew) {
            form.finish(onClose)
            return
          }
          // DL-MOT-02: a quick check on the button, then a fresh form in the same
          // wallet, type and date, ready for the next one.
          setSavedOne(true)
          setTimeout(() => {
            onSavedAndNew({
              type,
              walletId: entry.walletId,
              date,
              ...(entry.toWalletId ? { toWalletId: entry.toWalletId } : {}),
            })
          }, 450)
        },
      })
    })
  }

  // TXN-10: skipping one date of a recurring transaction that asks first.
  function skip(recurring: Recurring, occurrence: string) {
    save.mutate([recurringChange(recurring, { handled: occurrence })], {
      onSuccess: () => {
        onClose()
        undo({
          message: t('recurring.skipped'),
          undo: () => {
            save.mutate([recurringChange(recurring)])
          },
        })
      },
    })
  }

  // TXN-09: stopping a recurring transaction; what it already added stays.
  function stop(recurring: Recurring) {
    const { id, ...record } = recurring
    save.mutate([{ id, body: { deleted: true, type: recurringRecordType } }], {
      onSuccess: () => {
        onClose()
        undo({
          message: t('recurring.stopped'),
          seconds: 10,
          undo: () => {
            save.mutate([{ id, body: recordBody(recurringRecordType, record) }])
          },
        })
      },
    })
  }

  // TXN-33: what is still to be billed on a saved plan, which can be paid off early.
  const plannedLeft =
    mode.kind === 'edit' && mode.transaction.installments
      ? (activePlans(
          mode.transaction.walletId,
          [mode.transaction],
          credit?.closingDay ?? null,
          today,
        )[0]?.left ?? null)
      : null

  const parts = money.parts({ minor: 0, currency: from?.currency ?? ledger.defaultCurrency })
  const balances = walletBalances(ledger.wallets, balanceEntries(ledger, today))
  // WAL-04: inactive wallets are left out of the picker, unless this one is already in one.
  const choices = (current: string | null, other: string | null) =>
    ledger.wallets.filter(
      (wallet) => wallet.id !== other && (wallet.active || wallet.id === current),
    )

  return (
    <>
      <SegmentedControl<EntryType>
        label={t('transactions.type')}
        options={[
          { value: 'expense', label: t('transactions.types.expense') },
          { value: 'income', label: t('transactions.types.income') },
          { value: 'transfer', label: t('transactions.types.transfer') },
        ]}
        value={type}
        onChange={onType}
      />
      <AmountField
        label={t('transactions.amount')}
        value={text}
        onChange={(next) => {
          setText(next)
          if (!exchange) return
          const amount = parseAmount(next, exchange.from.currency, locale)
          if (amount !== null && rate !== null && rate > 0) fromRate(rate, amount)
        }}
        locale={locale}
        decimals={fractionDigits(from?.currency ?? ledger.defaultCurrency)}
        prefix={parts.prefix.trim()}
        suffix={parts.suffix.trim()}
        error={form.tried ? amountError : null}
        autoFocus={mode.kind === 'new'}
      />

      {/* Folds that are closed take no room, so the gaps live inside them. */}
      <div className="flex flex-col">
        <FieldRows
          note={
            form.tried && (categoryError ?? walletError ?? toError ?? dateError ?? endsError) ? (
              <FieldNote error>
                {categoryError ?? walletError ?? toError ?? dateError ?? endsError}
              </FieldNote>
            ) : series ? (
              <FieldNote>{t('recurring.editHint')}</FieldNote>
            ) : null
          }
        >
          {/* DL-MOT-07: a transfer has no category, so the row folds away (CAT-20). */}
          <li
            className="fold"
            data-closed={transfer ? '' : undefined}
            aria-hidden={transfer || undefined}
            inert={transfer}
          >
            <ul>
              <PickerRow
                label={t('transactions.category')}
                value={category?.name ?? t('pickers.choose')}
                valueLeading={
                  category && (
                    <CategoryTile
                      category={category}
                      group={ledger.groups.find((group) => group.id === category.groupId)}
                    />
                  )
                }
                error={form.tried && categoryError !== null}
                onClick={() => {
                  setChoosing('category')
                }}
              />
            </ul>
          </li>
          <PickerRow
            separator={!transfer}
            label={transfer ? t('transactions.from') : t('transactions.wallet')}
            value={from?.name ?? t('pickers.choose')}
            error={form.tried && walletError !== null}
            onClick={() => {
              setChoosing('from')
            }}
          />
          {/* DL-MOT-07: the destination opens in place when the type becomes a transfer. */}
          <li
            className="fold"
            data-closed={transfer ? undefined : ''}
            aria-hidden={!transfer || undefined}
            inert={!transfer}
          >
            <ul>
              <PickerRow
                label={t('transactions.to')}
                value={to?.name ?? t('pickers.choose')}
                error={form.tried && toError !== null}
                separator
                onClick={() => {
                  setChoosing('to')
                }}
              />
            </ul>
          </li>
          <DateRow
            label={repeating ? t('recurring.starts') : t('transactions.date')}
            value={date}
            {...(repeating ? {} : { max: today })}
            onChange={setDate}
            error={form.tried && dateError !== null}
          />
          {/* TXN-09: Repeat sits under the date, as in iOS Calendar; Ends opens once it
              repeats (DL-MOT-07). A saved one opens the recurring transaction it came from. */}
          {canRepeat && (
            <PickerRow
              label={t('recurring.repeat')}
              value={repeatLabel(t, repeat)}
              error={false}
              onClick={() => {
                setChoosing('repeat')
              }}
            />
          )}
          {canRepeat && (
            <li
              className="fold"
              data-closed={repeating ? undefined : ''}
              aria-hidden={!repeating || undefined}
              inert={!repeating}
            >
              <ul>
                <PickerRow
                  label={t('recurring.ends')}
                  value={endsLabel(t, ends, locale)}
                  error={form.tried && endsError !== null}
                  separator
                  onClick={() => {
                    setChoosing('ends')
                  }}
                />
              </ul>
            </li>
          )}
          {origin && onOpenSeries && (
            <PickerRow
              label={t('recurring.repeat')}
              value={repeatLabel(t, origin.every)}
              error={false}
              onClick={() => {
                onOpenSeries(origin)
              }}
            />
          )}
        </FieldRows>

        {/* TXN-10: whether it waits to be checked, with what that means in the row. */}
        <Fold open={repeating}>
          <div className="pt-3">
            <List inset>
              <ChoiceRow
                role="switch"
                title={t('recurring.ask')}
                subtitle={t('recurring.askHint')}
                checked={ask}
                onToggle={() => {
                  setAsk(!ask)
                }}
              />
            </List>
          </div>
        </Fold>

        {/* TXN-30: an expense made once can be paid in installments. */}
        <Fold open={installable && from !== undefined}>
          {installable && from && (
            <div className="pt-3">
              <InstallmentsFields
                state={plan}
                onChange={setPlan}
                currency={from.currency}
                onCard={from.features.includes('creditLimit')}
                closingDay={credit?.closingDay ?? null}
                date={date}
                price={magnitude}
                payment={payment}
                errors={{
                  months: form.tried && monthsError,
                  payment: form.tried ? paymentError : null,
                }}
                left={plannedLeft}
              />
            </div>
          )}
        </Fold>

        {/* TXN-05: between currencies, what arrived or the rate; the other is worked out. */}
        <Fold open={crossCurrency}>
          {from && to && (
            <div className="pt-3">
              <FieldRows
                note={
                  form.tried && receivedError ? (
                    <FieldNote error>{receivedError}</FieldNote>
                  ) : (
                    <FieldNote>{t('transactions.rateHint')}</FieldNote>
                  )
                }
              >
                <MoneyRow
                  label={t('transactions.received')}
                  value={receivedText}
                  onChange={(next) => {
                    setReceivedText(next)
                    fromReceived(parseAmount(next, to.currency, locale))
                  }}
                  locale={locale}
                  decimals={fractionDigits(to.currency)}
                  suffix={to.currency}
                  error={form.tried && receivedError !== null}
                />
                <FieldRow
                  label={t('rates.one', { currency: from.currency })}
                  value={rateText}
                  onChange={(event) => {
                    setRateText(event.target.value)
                    fromRate(parseDecimal(event.target.value, locale, rateDecimals))
                  }}
                  inputMode="decimal"
                  placeholder="0"
                  suffix={to.currency}
                />
              </FieldRows>
            </div>
          )}
        </Fold>
        {/* TXN fields: the payee and tags, optional, for expenses and income. */}
        <Fold open={!transfer}>
          <div className="pt-3">
            <FieldRows>
              <PickerRow
                label={t('transactions.payee')}
                value={payee?.name ?? t('pickers.none')}
                error={false}
                onClick={() => {
                  setChoosing('payee')
                }}
              />
              <PickerRow
                label={t('transactions.tags')}
                value={
                  chosenTags.length > 0
                    ? chosenTags.map((tag) => tag.name).join(', ')
                    : t('pickers.none')
                }
                error={false}
                onClick={() => {
                  setChoosing('tags')
                }}
              />
            </FieldRows>
          </div>
        </Fold>
      </div>

      <div className="flex flex-col">
        <label className="flex flex-col">
          <span className="sr-only">{t('transactions.note')}</span>
          <textarea
            value={note}
            onChange={(event) => {
              setNote(event.target.value)
            }}
            maxLength={500}
            rows={1}
            placeholder={t('transactions.notePlaceholder')}
            className="min-h-[3.25rem] resize-none rounded-2xl bg-inset px-4 py-3.5 text-[0.9375rem] text-text caret-brand placeholder:text-text-faint focus:outline-none"
          />
        </label>

        {/* TXN-06: transfers are never in the budget, so only expenses and income ask. */}
        <Fold open={!transfer}>
          <div className="pt-3">
            <List inset>
              <ChoiceRow
                role="switch"
                title={t('transactions.excluded')}
                subtitle={t('transactions.excludedHint')}
                checked={excluded}
                onToggle={() => {
                  setExcluded(!excluded)
                }}
              />
            </List>
          </div>
        </Fold>
      </div>

      {mode.kind === 'edit' && onDelete && (
        <Button
          variant="danger"
          onClick={() => {
            onDelete(mode.transaction)
          }}
        >
          {t('transactions.delete')}
        </Button>
      )}
      {series && (
        <Button
          variant="danger"
          onClick={() => {
            stop(series)
          }}
        >
          {t('recurring.stop')}
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
        secondary={
          mode.kind === 'due' ? (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                skip(mode.recurring, mode.date)
              }}
            >
              {t('recurring.skip')}
            </Button>
          ) : mode.kind === 'new' && !repeating && !mode.fromImport ? (
            // DL-CMP-05: a tinted second action beside the main one.
            <Button
              variant="secondary"
              className="relative flex-1"
              aria-disabled={save.isPending || savedOne || undefined}
              onClick={() => {
                if (!save.isPending && !savedOne) submit(true)
              }}
            >
              <span className={savedOne ? 'invisible' : ''}>{t('transactions.saveAndNew')}</span>
              {savedOne && (
                <CheckIcon
                  aria-hidden
                  weight="bold"
                  className="absolute size-6 animate-[check-in_260ms_cubic-bezier(0.32,0.72,0,1)]"
                />
              )}
            </Button>
          ) : null
        }
        onClick={() => {
          submit(false)
        }}
      >
        {t('transactions.save')}
      </SubmitButton>

      <WalletPicker
        open={choosing === 'from' || choosing === 'to'}
        title={
          choosing === 'to'
            ? t('transactions.to')
            : transfer
              ? t('transactions.from')
              : t('transactions.wallet')
        }
        wallets={
          choosing === 'to'
            ? choices(toWalletId, walletId)
            : choices(walletId, transfer ? toWalletId : null)
        }
        balances={balances}
        value={choosing === 'to' ? toWalletId : walletId}
        defaultCurrency={ledger.defaultCurrency}
        onChoose={(id) => {
          if (choosing === 'to') chooseTo(id)
          else {
            setWalletId(id)
            setWalletTouched(true)
          }
          setChoosing(null)
        }}
        onClose={() => {
          setChoosing(null)
        }}
      />

      <CategoryPicker
        open={choosing === 'category'}
        ledger={ledger}
        type={type === 'income' ? 'income' : 'expense'}
        value={category?.id ?? null}
        onChoose={(chosen) => {
          setCategoryId(chosen.id)
          setChoosing(null)
        }}
        onClose={() => {
          setChoosing(null)
        }}
      />

      <PayeePicker
        open={choosing === 'payee'}
        payees={allPayees}
        value={payeeId}
        onChoose={(chosen) => {
          setPayeeId(chosen?.id ?? null)
          setChoosing(null)
          // TXN-08: a payee used before fills in what went with it last time, without
          // undoing anything the person already chose.
          const memory =
            chosen && mode.kind === 'new' ? payeeMemory(ledger.transactions, chosen.id) : null
          if (!memory) return
          if (categoryId === null && memory.categoryId !== undefined && memory.type === type)
            setCategoryId(memory.categoryId)
          if (tagIds.length === 0 && memory.tagIds.length > 0) setTagIds(memory.tagIds)
          if (!walletTouched && byId.get(memory.walletId)?.active) setWalletId(memory.walletId)
        }}
        onCreate={(name) => {
          const created = { id: newId(), name }
          setNewPayees([...newPayees, created])
          return created
        }}
        onClose={() => {
          setChoosing(null)
        }}
      />

      <TagPicker
        open={choosing === 'tags'}
        tags={allTags}
        transactions={ledger.transactions}
        categoryId={category?.id ?? null}
        value={tagIds}
        onChange={setTagIds}
        onCreate={(name) => {
          const created: Tag = { id: newId(), name, color: nextTagColor(allTags) }
          setNewTags([...newTags, created])
          return created
        }}
        onClose={() => {
          setChoosing(null)
        }}
      />

      <RepeatSheet
        open={choosing === 'repeat'}
        value={repeat}
        allowNever={mode.kind === 'new'}
        onChange={setRepeat}
        onClose={() => {
          setChoosing(null)
        }}
      />
      <EndsSheet
        open={choosing === 'ends'}
        value={ends}
        start={date}
        onChange={setEnds}
        onClose={() => {
          setChoosing(null)
        }}
      />

      <ActionSheet
        open={discarding}
        title={t('wallets.form.discardTitle')}
        message={
          mode.kind === 'edit' ? t('transactions.discardEdit') : t('transactions.discardNew')
        }
        cancelLabel={t('wallets.form.keepEditing')}
        actions={[{ label: t('wallets.form.discard'), tone: 'danger', onSelect: onClose }]}
        onClose={() => {
          setDiscarding(false)
        }}
      />
    </>
  )
}

/** An import batch with one row it left for later now added. */
function fixedRow(batch: Ledger['batches'][number], line: number): RecordChange {
  const { id, ...data } = batch
  const waiting = data.waiting.filter((row) => row.line !== line)
  const added = data.waiting.length - waiting.length
  return {
    id,
    body: recordBody(
      importBatchRecordType,
      importBatchRecord.parse({
        ...data,
        waiting,
        imported: data.imported + added,
        skipped: Math.max(0, data.skipped - added),
      }),
    ),
  }
}
