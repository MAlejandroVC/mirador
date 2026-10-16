import {
  payeeRecord,
  payeeRecordType,
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
  startingWallet,
  type Tag,
  toCalendarDate,
  type Transaction,
  type TransactionSource,
  walletBalances,
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
import { useMoney } from '../../lib/format'
import { markNew } from '../../lib/motion'
import { CategoryPicker } from '../categories/category-picker'
import { CategoryTile } from '../categories/category-tile'
import { PayeePicker } from '../categories/payee-picker'
import { TagPicker } from '../categories/tag-picker'
import {
  type Ledger,
  newId,
  type RecordChange,
  recordBody,
  transactionBody,
  useLedger,
  useSaveRecords,
} from '../wallets/use-ledger'
import { WalletPicker } from './wallet-picker'

/** What the sheet is for: a new transaction, or changing one that was saved. */
export type EntryMode =
  | { kind: 'new'; source: TransactionSource }
  | { kind: 'edit'; transaction: Transaction & { kind: EntryType } }

// TXN-01: adding or changing an expense, an income or a transfer in a sheet
// (DL-CMP-08). The same sheet is quick-add's manual entry (WID-03, WID-07): only the
// amount is needed, since the wallet, the type and the date start filled in.
export function EntrySheet({
  open,
  mode,
  onClose,
  onDelete,
  empty,
}: {
  open: boolean
  mode: EntryMode
  onClose: () => void
  onDelete?: (transaction: Transaction) => void
  /** Shown instead of the form while there is no wallet to put a transaction in. */
  empty?: ReactNode
}) {
  const { t } = useTranslation()
  const { data: ledger } = useLedger()
  const initialType = mode.kind === 'edit' ? mode.transaction.kind : 'expense'
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
    mode.kind === 'edit' ? t(`transactions.editTitle.${type}`) : t(`transactions.newTitle.${type}`)

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
}) {
  const { t } = useTranslation()
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
          ...seed,
        }
  const [walletId, setWalletId] = useState<string | null>(initial.walletId || null)
  const [toWalletId, setToWalletId] = useState<string | null>(initial.toWalletId ?? null)
  const from = walletId === null ? undefined : byId.get(walletId)
  const to = toWalletId === null ? undefined : byId.get(toWalletId)
  const [text, setText] = useState(
    initial.amount > 0 && from ? amountText(initial.amount, from.currency, locale) : '',
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
  const [choosing, setChoosing] = useState<'from' | 'to' | 'category' | 'tags' | 'payee' | null>(
    null,
  )
  const [discarding, setDiscarding] = useState(false)
  const [savedOne, setSavedOne] = useState(false)

  const transfer = type === 'transfer'
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
  const dateError = !date
    ? t('wallets.transactions.dateMissing')
    : date > today
      ? t('wallets.transactions.dateFuture')
      : null
  const complete = [
    amountError,
    categoryError,
    walletError,
    toError,
    receivedError,
    dateError,
  ].every((error) => error === null)

  const draft = (): EntryDraft | null => {
    if (!from || magnitude === null) return null
    return {
      type,
      amount: magnitude,
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
    }
  }

  // DL-CMP-08: anything changed since the sheet opened asks before it is thrown away.
  const [initialReceived] = useState(receivedText)
  const snapshot = (values: unknown[]) => JSON.stringify(values)
  const dirty =
    snapshot([
      initial.type,
      initial.amount,
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
    ])

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
      const id = mode.kind === 'edit' ? mode.transaction.id : newId()
      const fields =
        mode.kind === 'edit'
          ? entryFields(
              entry,
              mode.transaction.source ?? 'manual',
              now,
              mode.transaction.createdAt ?? now,
            )
          : entryFields(entry, mode.source, now)
      // New tags and payees still in use go in the same batch (NFR-08).
      const changes: RecordChange[] = [
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
        { id, body: transactionBody(transactionRecord.parse(fields)) },
      ]
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

  const parts = money.parts({ minor: 0, currency: from?.currency ?? ledger.defaultCurrency })
  const balances = walletBalances(ledger.wallets, ledger.transactions)
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
            form.tried && (categoryError ?? walletError ?? toError ?? dateError) ? (
              <FieldNote error>{categoryError ?? walletError ?? toError ?? dateError}</FieldNote>
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
            label={t('transactions.date')}
            value={date}
            max={today}
            onChange={setDate}
            error={form.tried && dateError !== null}
          />
        </FieldRows>

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
          mode.kind === 'new' ? (
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
