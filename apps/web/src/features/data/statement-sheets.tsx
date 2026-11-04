import { amountText, fractionDigits, parseAmount, toCalendarDate } from '@repo/core'
import {
  type Box,
  type ColumnField,
  type ColumnSettings,
  fieldsOf,
  type PlannedRow,
  readBox,
  type RowField,
} from '@repo/import'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChoiceRow } from '../../components/ui/choice-row'
import { DateRow } from '../../components/ui/date-field'
import { FieldNote, FieldRow, FieldRows, MoneyRow } from '../../components/ui/field-row'
import { List, ListButtonRow } from '../../components/ui/list'
import { PickerRow } from '../../components/ui/picker-row'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet } from '../../components/ui/sheet'
import { SubmitButton } from '../../components/ui/submit-button'
import { useSubmit } from '../../components/ui/use-submit'
import { useMoney } from '../../lib/format'
import { CategoryPicker } from '../categories/category-picker'
import { type PageBox, PagePart } from './page-part'
import { around, rowRegion } from './statement-model'
import type { ReviewProps } from './statement-review'
import { sourceOf } from './statement-model'

// IMP-40, IMP-14, IMP-39: the sheets of the statement review: checking one row against
// its part of the page, adding a row from a box drawn around it, how the statement's
// columns are read, and what to change on the wallet.

type Segment = RowField | 'ignore'

/** IMP-40: one row's fields, each boxed where it was read, to check and correct. */
export function CheckRowSheet(
  props: ReviewProps & { item: PlannedRow | null; onClose: () => void },
) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={props.item !== null}
      title={t('data.review.fixTitle')}
      cancelLabel={t('nav.cancel')}
      onClose={props.onClose}
    >
      {props.item && <CheckRowForm key={props.item.row.line} {...props} item={props.item} />}
    </Sheet>
  )
}

function CheckRowForm(props: ReviewProps & { item: PlannedRow; onClose: () => void }) {
  const { t } = useTranslation()
  const { item, file, ledger, decisions } = props
  const { row } = item
  const currency = row.currency
  const money = useMoney(currency)
  const found = sourceOf(file, row.line)
  const [segment, setSegment] = useState<Segment>(
    item.status.kind === 'check' ? (item.status.fields[0] ?? 'amount') : 'payee',
  )
  const [date, setDate] = useState(row.date ?? '')
  const [payee, setPayee] = useState(row.payee)
  const [text, setText] = useState(
    row.amount !== null ? amountText(Math.abs(row.amount), currency, money.locale) : '',
  )
  const [plan, setPlan] = useState(row.installment !== undefined)
  const [month, setMonth] = useState(String(row.installment?.month ?? 1))
  const [months, setMonths] = useState(String(row.installment?.months ?? 6))
  const [ignore, setIgnore] = useState(decisions.ignore?.has(row.line) ?? false)
  const [categoryId, setCategoryId] = useState<string | null>(
    decisions.categories.get(row.line) ?? item.suggestedCategoryId,
  )
  const [picking, setPicking] = useState(false)
  const form = useSubmit()
  const amount = parseAmount(text, currency, money.locale)
  const mark = { month: Number(month), months: Number(months) }
  const badPlan =
    plan &&
    !(
      Number.isInteger(mark.month) &&
      Number.isInteger(mark.months) &&
      mark.months >= 2 &&
      mark.months <= 60 &&
      mark.month >= 1 &&
      mark.month <= mark.months
    )
  const missing = ignore
    ? null
    : !date
      ? 'date'
      : amount === null || amount === 0
        ? 'amount'
        : badPlan
          ? 'installment'
          : null
  const category = ledger.categories.find((item) => item.id === categoryId)
  const unsure = item.status.kind === 'check' ? item.status.fields : []

  const boxes: PageBox[] = []
  if (found)
    for (const key of ['date', 'payee', 'amount', 'installment'] as const) {
      const box = fieldsOf(found.source, props.settings)[key]
      if (!box) continue
      boxes.push({
        key,
        box,
        tone:
          key === 'installment'
            ? 'dashed'
            : (key === 'date' || key === 'amount') && unsure.includes(key)
              ? 'warning'
              : 'brand',
        tag: t(`data.statement.fields.${key}`),
        strong: segment === key,
        onClick: () => {
          setSegment(key)
        },
      })
    }

  return (
    <>
      {found && (
        <PagePart
          className="mt-4"
          image={found.image}
          region={rowRegion(
            found.source.box,
            boxes.map((item) => item.box),
            2.2,
          )}
          boxes={ignore ? [] : boxes}
        />
      )}
      <SegmentedControl
        label={t('data.statement.which')}
        options={(['date', 'payee', 'amount', 'installment', 'ignore'] as const).map((value) => ({
          value,
          label: t(`data.statement.segments.${value}`),
        }))}
        value={segment}
        onChange={setSegment}
      />
      <p className="-mt-1 px-4 text-[0.8125rem] text-text-muted">{t('data.statement.whichHint')}</p>
      {segment === 'ignore' && (
        <List inset>
          <ChoiceRow
            role="switch"
            title={t('data.statement.ignore')}
            subtitle={t('data.statement.ignoreHint')}
            checked={ignore}
            onToggle={() => {
              setIgnore(!ignore)
            }}
          />
        </List>
      )}
      {!ignore && (
        <FieldRows
          note={
            form.tried && missing ? (
              <FieldNote error>{t(`data.statement.missing.${missing}`)}</FieldNote>
            ) : unsure.length > 0 ? (
              <FieldNote>{t('data.statement.checkHint')}</FieldNote>
            ) : undefined
          }
        >
          <DateRow
            label={t('transactions.date')}
            value={date}
            onChange={setDate}
            error={form.tried && missing === 'date'}
          />
          <FieldRow
            label={t('data.statement.fields.payee')}
            value={payee}
            maxLength={80}
            onChange={(event) => {
              setPayee(event.target.value)
            }}
          />
          <MoneyRow
            label={t('transactions.amount')}
            value={text}
            onChange={setText}
            locale={money.locale}
            decimals={fractionDigits(currency)}
            placeholder="0"
            error={form.tried && missing === 'amount'}
          />
          <PickerRow
            label={t('transactions.category')}
            value={category?.name ?? t('data.review.uncategorized')}
            error={false}
            onClick={() => {
              setPicking(true)
            }}
          />
        </FieldRows>
      )}
      {!ignore && (row.amount ?? -1) < 0 && (
        <FieldRows note={<FieldNote>{t('data.statement.planHint')}</FieldNote>}>
          <ChoiceRow
            role="switch"
            title={t('data.statement.inInstallments')}
            checked={plan}
            onToggle={() => {
              setPlan(!plan)
            }}
          />
          {plan && (
            <>
              <FieldRow
                label={t('data.statement.month')}
                inputMode="numeric"
                value={month}
                error={form.tried && missing === 'installment'}
                onChange={(event) => {
                  setMonth(event.target.value.replace(/\D/g, '').slice(0, 2))
                }}
              />
              <FieldRow
                label={t('data.statement.of')}
                inputMode="numeric"
                value={months}
                suffix={t('data.statement.monthsSuffix')}
                error={form.tried && missing === 'installment'}
                onChange={(event) => {
                  setMonths(event.target.value.replace(/\D/g, '').slice(0, 2))
                }}
              />
            </>
          )}
        </FieldRows>
      )}
      <SubmitButton
        button={form.button}
        done={form.done}
        pending={false}
        onClick={() => {
          form.submit(missing === null, () => {
            const left = new Set(decisions.ignore)
            if (ignore) left.add(row.line)
            else left.delete(row.line)
            props.onDecisions({ ...decisions, ignore: left })
            if (!ignore && amount !== null)
              props.onFix(
                row.line,
                {
                  date,
                  // The direction stays as the statement had it.
                  amount: (row.amount ?? -1) < 0 ? -amount : amount,
                  payee: payee.trim(),
                  installment: plan ? mark : null,
                },
                categoryId,
              )
            form.finish(props.onClose)
          })
        }}
      >
        {t('data.review.fixSave')}
      </SubmitButton>
      <CategoryPicker
        open={picking}
        ledger={ledger}
        type={(row.amount ?? -1) < 0 ? 'expense' : 'income'}
        value={categoryId}
        onChoose={(chosen) => {
          setCategoryId(chosen.id)
          setPicking(false)
        }}
        onClose={() => {
          setPicking(false)
        }}
      />
    </>
  )
}

/** IMP-40: a row the reader missed, read from the box the person drew around it. */
export function AddRowSheet(
  props: ReviewProps & { drawn: { page: number; box: Box } | null; onClose: () => void },
) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={props.drawn !== null}
      title={t('data.statement.addRow')}
      cancelLabel={t('nav.cancel')}
      onClose={props.onClose}
    >
      {props.drawn && (
        <AddRowForm
          key={`${String(props.drawn.page)}-${String(props.drawn.box.y)}`}
          {...props}
          drawn={props.drawn}
        />
      )}
    </Sheet>
  )
}

function AddRowForm(
  props: ReviewProps & { drawn: { page: number; box: Box }; onClose: () => void },
) {
  const { t } = useTranslation()
  const { file, ledger, settings, drawn } = props
  const currency = props.planned[0]?.row.currency ?? ledger.defaultCurrency
  const money = useMoney(currency)
  const image = file.pages?.[drawn.page] ?? null
  const year = Number(
    (props.planned.find((item) => item.row.date)?.row.date ?? toCalendarDate(new Date())).slice(
      0,
      4,
    ),
  )
  const [read] = useState(() =>
    image
      ? readBox({ width: image.width, height: image.height, words: [...image.words] }, drawn.box, {
          year,
          order: settings.dateOrder,
        })
      : { date: null, payee: '', amount: null, installment: null },
  )
  const readMinor = read.amount
    ? parseAmount(read.amount.replace(/[^\d.,]/g, ''), currency, money.locale)
    : null
  const [date, setDate] = useState(read.date ?? '')
  const [payee, setPayee] = useState(read.payee)
  const [text, setText] = useState(
    readMinor !== null ? amountText(Math.abs(readMinor), currency, money.locale) : '',
  )
  const [income, setIncome] = useState(false)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const form = useSubmit()
  const amount = parseAmount(text, currency, money.locale)
  const missing = !date ? 'date' : amount === null || amount === 0 ? 'amount' : null
  const category = ledger.categories.find((item) => item.id === categoryId)
  return (
    <>
      {image && (
        <PagePart
          image={image}
          region={around(drawn.box, 0.02, drawn.box.height * 2)}
          boxes={[{ key: 'drawn', box: drawn.box, tone: 'brand', strong: true }]}
        />
      )}
      <FieldRows
        note={
          form.tried && missing ? (
            <FieldNote error>{t(`data.statement.missing.${missing}`)}</FieldNote>
          ) : (
            <FieldNote>{t('data.statement.fromBox')}</FieldNote>
          )
        }
      >
        <DateRow
          label={t('transactions.date')}
          value={date}
          onChange={setDate}
          error={form.tried && missing === 'date'}
        />
        <FieldRow
          label={t('data.statement.fields.payee')}
          value={payee}
          maxLength={80}
          onChange={(event) => {
            setPayee(event.target.value)
          }}
        />
        <MoneyRow
          label={t('transactions.amount')}
          value={text}
          onChange={setText}
          locale={money.locale}
          decimals={fractionDigits(currency)}
          placeholder="0"
          error={form.tried && missing === 'amount'}
        />
        <PickerRow
          label={t('transactions.category')}
          value={category?.name ?? t('data.review.uncategorized')}
          error={false}
          onClick={() => {
            setPicking(true)
          }}
        />
      </FieldRows>
      <List inset>
        <ChoiceRow
          role="switch"
          title={t('data.statement.moneyIn')}
          checked={income}
          onToggle={() => {
            setIncome(!income)
          }}
        />
      </List>
      <SubmitButton
        button={form.button}
        done={form.done}
        pending={false}
        onClick={() => {
          form.submit(missing === null, () => {
            if (amount === null) return
            props.onAddRow(
              drawn.page,
              drawn.box,
              {
                date,
                amount: income ? Math.abs(amount) : -Math.abs(amount),
                payee: payee.trim(),
                installment: read.installment,
              },
              categoryId,
            )
            form.finish(props.onClose)
          })
        }}
      >
        {t('data.statement.addRowSave')}
      </SubmitButton>
      <CategoryPicker
        open={picking}
        ledger={ledger}
        type={income ? 'income' : 'expense'}
        value={categoryId}
        onChoose={(chosen) => {
          setCategoryId(chosen.id)
          setPicking(false)
        }}
        onClose={() => {
          setPicking(false)
        }}
      />
    </>
  )
}

/** A statement column's role, as the layout sheet offers it. */
type Role = ColumnField | 'charges'

const roles: Role[] = ['date', 'payee', 'amount', 'charges', 'outflow', 'inflow', 'note', 'skip']

function roleOf(settings: ColumnSettings, index: number): Role {
  const field = settings.columns[index] ?? 'skip'
  return field === 'amount' && settings.amountSign === 'positiveIsExpense' ? 'charges' : field
}

/**
 * IMP-14, IMP-03: how the statement's columns are read. A change applies to every row,
 * and to every later statement with the same layout, until the person forgets it.
 */
export function LayoutSheet(props: ReviewProps & { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { file, settings, ledger } = props
  const [picking, setPicking] = useState<number | null>(null)
  const wallet = ledger.wallets.find((item) => item.id === props.walletId)
  const samples = (index: number) =>
    file.table.rows
      .map((row) => (row[index] ?? '').trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(' · ')
  const choose = (index: number, role: Role) => {
    const field: ColumnField = role === 'charges' ? 'amount' : role
    // A field holds one column, so choosing it again moves it here.
    const columns = settings.columns.map((current, position) =>
      position === index ? field : field !== 'skip' && current === field ? 'skip' : current,
    )
    props.onSettings({
      ...settings,
      columns,
      ...(field === 'amount'
        ? { amountSign: role === 'charges' ? 'positiveIsExpense' : 'negativeIsExpense' }
        : {}),
    })
  }
  return (
    <Sheet
      open={props.open}
      title={t('data.statement.layout')}
      doneLabel={t('nav.done')}
      onClose={props.onClose}
    >
      <List inset label={t('data.statement.columns')}>
        {file.table.header.map((name, index) => {
          const role = roleOf(settings, index)
          return (
            <ListButtonRow
              key={`${name}-${String(index)}`}
              tone="text"
              title={name || t('data.columns.unnamed', { number: index + 1 })}
              subtitle={samples(index) || t('data.columns.empty')}
              trailing={
                <span
                  className={`shrink-0 text-[0.9375rem] ${role === 'skip' ? 'text-text-muted' : 'text-brand'}`}
                >
                  {t(`data.statement.roles.${role}`)}
                </span>
              }
              onClick={() => {
                setPicking(index)
              }}
            />
          )
        })}
      </List>
      <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">
        {t('data.statement.columnsHint')}
      </p>
      <List inset>
        <ChoiceRow
          role="switch"
          title={t('data.statement.readMarks')}
          subtitle={t('data.statement.readMarksHint')}
          checked={settings.installments !== false}
          onToggle={() => {
            props.onSettings({ ...settings, installments: settings.installments === false })
          }}
        />
      </List>
      <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">
        {wallet
          ? t('data.statement.fromNowOn', { wallet: wallet.name })
          : t('data.statement.fromNowOnAny')}
      </p>
      {props.remembered && (
        <List inset>
          <li>
            <button
              type="button"
              onClick={() => {
                props.onForget()
                props.onClose()
              }}
              className="flex min-h-[3.25rem] w-full items-center px-4 text-left text-[0.9375rem] text-danger focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
            >
              {wallet
                ? t('data.statement.forget', { wallet: wallet.name })
                : t('data.statement.forgetAny')}
            </button>
          </li>
        </List>
      )}
      <Sheet
        open={picking !== null}
        title={file.table.header[picking ?? 0] ?? ''}
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          setPicking(null)
        }}
      >
        <List inset>
          {roles.map((role) => (
            <ChoiceRow
              key={role}
              role="radio"
              title={t(`data.statement.roles.${role}`)}
              {...(role === 'amount' || role === 'charges'
                ? { subtitle: t(`data.statement.rolesHint.${role}`) }
                : {})}
              checked={picking !== null && roleOf(settings, picking) === role}
              onToggle={() => {
                if (picking !== null) choose(picking, role)
                setPicking(null)
              }}
            />
          ))}
        </List>
      </Sheet>
    </Sheet>
  )
}

/**
 * IMP-39, IMP-29: what the statement shows differently about the wallet, each on by
 * default. Home works out what's due and coming up from these settings (DSH-11).
 */
export function UpdateSheet(props: ReviewProps & { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { ledger, updates, chosen } = props
  const wallet = ledger.wallets.find((item) => item.id === props.walletId)
  const money = useMoney(wallet?.currency ?? ledger.defaultCurrency)
  const today = toCalendarDate(new Date())
  const payees = new Map(ledger.payees.map((payee) => [payee.id, payee.name]))
  const recurring = new Map(ledger.recurring.map((item) => [item.id, item]))
  const toggle = (index: number) => {
    const next = new Set(chosen)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    props.onChosen(next)
  }
  const card = updates
    .map((update, index) => ({ update, index }))
    .filter(({ update }) => update.kind !== 'recurring')
  const charges = updates
    .map((update, index) => ({ update, index }))
    .filter(({ update }) => update.kind === 'recurring')
  const amount = (minor: number) =>
    money.text({ minor, currency: wallet?.currency ?? ledger.defaultCurrency })
  return (
    <Sheet
      open={props.open}
      title={t('data.statement.update', { wallet: wallet?.name ?? '' })}
      doneLabel={t('nav.done')}
      onClose={props.onClose}
    >
      <p className="px-4 text-[0.9375rem] text-text-muted">{t('data.statement.updateIntro')}</p>
      {card.length > 0 && (
        <List inset label={t('data.statement.card')}>
          {card.map(({ update, index }) =>
            update.kind === 'recurring' ? null : (
              <ChoiceRow
                key={update.kind}
                role="switch"
                title={
                  update.kind === 'limit'
                    ? t('data.statement.changes.limit', { amount: amount(update.after) })
                    : t(`data.statement.changes.${update.kind}`, { day: update.after })
                }
                subtitle={
                  update.before === null
                    ? t('data.statement.notSet')
                    : update.kind === 'limit'
                      ? t('data.statement.nowAmount', { amount: amount(update.before) })
                      : t('data.statement.nowDay', { day: update.before })
                }
                checked={chosen.has(index)}
                onToggle={() => {
                  toggle(index)
                }}
              />
            ),
          )}
        </List>
      )}
      {charges.length > 0 && (
        <List inset label={t('data.statement.recurringLabel')}>
          {charges.map(({ update, index }) => {
            if (update.kind !== 'recurring') return null
            const item = recurring.get(update.recurringId)
            const name =
              (item?.payeeId ? payees.get(item.payeeId) : undefined) ?? t('data.statement.thisOne')
            return (
              <ChoiceRow
                key={update.recurringId}
                role="switch"
                title={t('data.statement.turnOn', { name })}
                subtitle={t('data.statement.stillCharged', {
                  date: new Intl.DateTimeFormat(money.locale, {
                    month: 'long',
                    timeZone: 'UTC',
                    ...(update.until.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
                  }).format(new Date(`${update.until}T00:00:00Z`)),
                  amount: amount(Math.abs(update.amount)),
                })}
                checked={chosen.has(index)}
                onToggle={() => {
                  toggle(index)
                }}
              />
            )
          })}
        </List>
      )}
      <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">
        {t('data.statement.homeUses')}
      </p>
    </Sheet>
  )
}
