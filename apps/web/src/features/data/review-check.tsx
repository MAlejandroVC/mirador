import { amountText, fractionDigits, parseAmount } from '@repo/core'
import { type ColumnSettings, type PlannedRow, readAmount, type RowSource } from '@repo/import'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DateRow } from '../../components/ui/date-field'
import { FieldNote, FieldRows, MoneyRow } from '../../components/ui/field-row'
import { CheckIcon } from '../../components/ui/icons'
import { List } from '../../components/ui/list'
import { Sheet } from '../../components/ui/sheet'
import { SubmitButton } from '../../components/ui/submit-button'
import { useSubmit } from '../../components/ui/use-submit'
import { formatShortDate, useMoney } from '../../lib/format'
import type { ImportFile, PagePicture } from './import-model'

// IMP-10, IMP-31: the review's rows read from a picture with a date or an amount that
// was hard to read, each shown with its part of the page so the person can compare,
// and fixed in place. IMP-37: whether the rows add up to the statement's balances.

interface Fix {
  date: string
  amount: number
}

export function CheckSection({
  file,
  items,
  currency,
  label,
  onFix,
}: {
  file: ImportFile
  items: readonly PlannedRow[]
  currency: string
  label: (item: PlannedRow) => string
  onFix: (line: number, fix: Fix) => void
}) {
  const { t } = useTranslation()
  const money = useMoney(currency)
  const today = new Date().toISOString().slice(0, 10)
  const [fixing, setFixing] = useState<PlannedRow | null>(null)
  if (items.length === 0) return null
  const sources = 'sources' in file.table ? file.table.sources : []
  const pictureOf = (item: PlannedRow) => {
    const source = sources[item.row.line - 2]
    const image = source ? (file.pages?.[source.page] ?? null) : null
    return source && image ? { image, source } : null
  }
  return (
    <>
      <List inset label={`${t('data.review.check')} · ${String(items.length)}`}>
        {items.map((item) => {
          const fields = item.status.kind === 'check' ? item.status.fields : []
          const picture = pictureOf(item)
          const amount = money.text({ minor: Math.abs(item.row.amount ?? 0), currency })
          return (
            <li key={item.row.line} className="border-separator not-first:border-t">
              <button
                type="button"
                onClick={() => {
                  setFixing(item)
                }}
                className="flex w-full flex-col gap-2 px-4 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
              >
                {picture && <Crop {...picture} />}
                <span className="flex min-h-11 w-full items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[0.9375rem] text-text">{label(item)}</span>
                    <span className="block text-[0.8125rem] text-text-muted">
                      {item.row.date ? formatShortDate(item.row.date, today, money.locale) : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.9375rem] text-text tabular-nums">{amount}</span>
                </span>
                {/* DL-COL-05: a gentle caution in `warning`, words only. */}
                <span className="text-[0.8125rem] text-warning">
                  {item.row.date === null
                    ? t('data.review.checkMissing.date')
                    : item.row.amount === null
                      ? t('data.review.checkMissing.amount')
                      : t(`data.review.checkFields.${fields.join('-') || 'amount'}`)}
                </span>
              </button>
            </li>
          )
        })}
      </List>
      <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">{t('data.review.checkNote')}</p>
      <FixSheet
        item={fixing}
        picture={fixing ? pictureOf(fixing) : null}
        currency={currency}
        onFix={(fix) => {
          if (fixing) onFix(fixing.row.line, fix)
        }}
        onClose={() => {
          setFixing(null)
        }}
      />
    </>
  )
}

/** The row's part of the page, a little wider than the row so it reads in context. */
function Crop({ image, source }: { image: PagePicture; source: RowSource }) {
  const padX = 0.01
  const padY = 0.004
  const x = Math.max(0, source.box.x - padX)
  const y = Math.max(0, source.box.y - padY)
  const width = Math.min(1 - x, source.box.width + padX * 2)
  const height = Math.min(1 - y, source.box.height + padY * 2)
  return (
    <span
      role="img"
      aria-hidden
      className="block w-full rounded-lg bg-inset bg-no-repeat"
      style={{
        backgroundImage: `url(${image.url})`,
        backgroundSize: `${String(100 / width)}% auto`,
        backgroundPosition: `${String(width >= 1 ? 0 : (x / (1 - width)) * 100)}% ${String(height >= 1 ? 0 : (y / (1 - height)) * 100)}%`,
        aspectRatio: String((width * image.width) / Math.max(1, height * image.height)),
      }}
    />
  )
}

type Picture = { image: PagePicture; source: RowSource } | null

function FixSheet({
  item,
  picture,
  currency,
  onFix,
  onClose,
}: {
  item: PlannedRow | null
  picture: Picture
  currency: string
  onFix: (fix: Fix) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={item !== null}
      title={t('data.review.fixTitle')}
      cancelLabel={t('nav.cancel')}
      onClose={onClose}
    >
      {item && (
        <FixForm
          item={item}
          picture={picture}
          currency={currency}
          onFix={onFix}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function FixForm({
  item,
  picture,
  currency,
  onFix,
  onClose,
}: {
  item: PlannedRow
  picture: Picture
  currency: string
  onFix: (fix: Fix) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const money = useMoney(currency)
  const decimals = fractionDigits(currency)
  const [date, setDate] = useState(item.row.date ?? '')
  const [text, setText] = useState(
    item.row.amount ? amountText(Math.abs(item.row.amount), currency, money.locale) : '',
  )
  const form = useSubmit()
  const amount = parseAmount(text, currency, money.locale)
  const missing = !date ? 'date' : amount === null || amount === 0 ? 'amount' : null
  return (
    <>
      {/* The row as the statement shows it, right above what to type. */}
      {picture && <Crop {...picture} />}
      <FieldRows
        note={
          form.tried && missing ? (
            <FieldNote error>{t(`data.review.fixMissing.${missing}`)}</FieldNote>
          ) : (
            <FieldNote>{t('data.review.fixHint')}</FieldNote>
          )
        }
      >
        <MoneyRow
          label={t('transactions.amount')}
          value={text}
          onChange={setText}
          locale={money.locale}
          decimals={decimals}
          placeholder="0"
          error={form.tried && missing === 'amount'}
        />
        <DateRow
          label={t('transactions.date')}
          value={date}
          onChange={setDate}
          error={form.tried && missing === 'date'}
        />
      </FieldRows>
      <SubmitButton
        button={form.button}
        done={form.done}
        pending={false}
        onClick={() => {
          form.submit(missing === null, () => {
            if (amount === null) return
            // The direction stays as the statement had it.
            onFix({ date, amount: (item.row.amount ?? -1) < 0 ? -amount : amount })
            form.finish(onClose)
          })
        }}
      >
        {t('data.review.fixSave')}
      </SubmitButton>
    </>
  )
}

/**
 * IMP-37: the statement's opening balance plus its rows should make its closing
 * balance. A card statement counts the other way (charges add to what is owed), so
 * either direction adding up counts.
 */
export function BalanceCheck({
  file,
  settings,
  planned,
  currency,
}: {
  file: ImportFile
  settings: ColumnSettings
  planned: readonly PlannedRow[]
  currency: string
}) {
  const { t } = useTranslation()
  const money = useMoney(currency)
  if (!('sources' in file.table)) return null
  const { opening, closing } = file.table
  if (opening === null || closing === null) return null
  const read = (text: string) => readAmount(text, settings.decimalMark, currency)
  const start = read(opening)
  const end = read(closing)
  if (start === null || end === null) return null
  const sum = planned.reduce((total, item) => total + (item.row.amount ?? 0), 0)
  const off = Math.min(Math.abs(start + sum - end), Math.abs(start - sum - end))
  const ending = money.text({ minor: Math.abs(end), currency })
  return (
    <p className="flex items-start gap-2 px-4 text-[0.8125rem] text-text-muted">
      {off === 0 ? (
        <>
          <span className="mt-px grid size-[1.125rem] shrink-0 place-items-center rounded-full bg-brand text-on-brand">
            <CheckIcon aria-hidden weight="bold" className="size-[0.6875rem]" />
          </span>
          {t('data.review.balanceMatches', { amount: ending })}
        </>
      ) : (
        <span className="text-warning">
          {t('data.review.balanceDiffers', {
            amount: ending,
            difference: money.text({ minor: off, currency }),
          })}
        </span>
      )}
    </p>
  )
}
