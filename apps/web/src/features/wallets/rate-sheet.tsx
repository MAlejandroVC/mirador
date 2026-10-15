import { exchangeRateRecord } from '@repo/api'
import {
  currencyName,
  decimalInput,
  type ExchangeRate,
  parseDecimal,
  rateDecimals,
  rateHistory,
  rateInUse,
  toCalendarDate,
  unitsPerOne,
} from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionSheet } from '../../components/ui/action-sheet'
import { Button } from '../../components/ui/button'
import { FieldNote, FieldRow, FieldRows } from '../../components/ui/field-row'
import { List, ListButtonRow } from '../../components/ui/list'
import { Sheet, SheetFooter } from '../../components/ui/sheet'
import { useUndo } from '../../components/ui/use-undo'
import { formatDay, formatRate, useLocale } from '../../lib/format'
import { exchangeRateBody, newId, useSaveRecords } from './use-ledger'

// SYS-04, SYS-05: the rate between a wallet's currency and the default one, as the
// person sees it at their bank or exchange office: "1 USD = 18.45 MXN", with a date.
// Each save adds to the history rather than replacing, so older totals keep the rate
// of their day. Opened right after adding a wallet in another currency (`prompt`),
// it offers "Add later" instead of Cancel, since the wallet is already saved.
export function RateSheet({
  open,
  currency,
  defaultCurrency,
  rates,
  prompt = false,
  onClose,
}: {
  open: boolean
  currency: string
  defaultCurrency: string
  rates: readonly ExchangeRate[]
  prompt?: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={open}
      title={t('rates.title')}
      cancelLabel={prompt ? t('rates.later') : t('nav.cancel')}
      onClose={onClose}
    >
      {open && (
        <RateForm
          currency={currency}
          defaultCurrency={defaultCurrency}
          rates={rates}
          prompt={prompt}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function RateForm({
  currency,
  defaultCurrency,
  rates,
  prompt,
  onClose,
}: {
  currency: string
  defaultCurrency: string
  rates: readonly ExchangeRate[]
  prompt: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const save = useSaveRecords()
  const undo = useUndo()
  const today = toCalendarDate(new Date())
  const inUse = rateInUse(currency, defaultCurrency, rates, today)
  const [text, setText] = useState(
    inUse ? decimalInput(unitsPerOne(inUse), rateDecimals, locale) : '',
  )
  const [date, setDate] = useState(today)
  const [touched, setTouched] = useState(false)
  const [removing, setRemoving] = useState<ExchangeRate | null>(null)
  const rate = parseDecimal(text, locale, rateDecimals)
  const rateError = rate === null || rate === 0 ? t('rates.invalid') : null
  const dateError = !date
    ? t('wallets.transactions.dateMissing')
    : date > today
      ? t('wallets.transactions.dateFuture')
      : null
  const history = rateHistory(currency, defaultCurrency, rates)
  const words = { today: t('dates.today'), yesterday: t('dates.yesterday') }

  return (
    <>
      <p className="px-2 text-center text-[0.9375rem] text-text-muted">
        {prompt
          ? t('rates.prompt')
          : t('rates.intro', { currency: currencyName(currency, locale) })}
      </p>
      <FieldRows
        note={
          touched && (rateError ?? dateError) ? (
            <FieldNote error>{rateError ?? dateError}</FieldNote>
          ) : (
            <FieldNote>{t('rates.hint')}</FieldNote>
          )
        }
      >
        <FieldRow
          label={t('rates.one', { currency })}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
          }}
          onBlur={() => {
            setTouched(true)
          }}
          inputMode="decimal"
          placeholder="0.00"
          suffix={defaultCurrency}
          autoFocus
          error={touched && rateError !== null}
        />
        <FieldRow
          label={t('wallets.transactions.date')}
          type="date"
          value={date}
          max={today}
          onChange={(event) => {
            setDate(event.target.value)
          }}
          error={dateError !== null}
        />
      </FieldRows>

      {history.length > 0 && (
        <List label={t('rates.history')} inset>
          {history.map((entry) => {
            const units = unitsPerOne({ rate: entry, inverse: entry.from !== currency })
            const used = inUse?.rate.id === entry.id
            return (
              <ListButtonRow
                key={entry.id}
                tone="text"
                title={`1 ${currency} = ${formatRate(units, locale)} ${defaultCurrency}`}
                subtitle={[
                  formatDay(entry.date, today, locale, words),
                  ...(used ? [t('rates.inUse')] : []),
                ].join(' · ')}
                onClick={() => {
                  setRemoving(entry)
                }}
              />
            )
          })}
        </List>
      )}

      {save.isError && <FieldNote error>{t('wallets.saveFailed')}</FieldNote>}
      <SheetFooter>
        <Button
          className="w-full"
          disabled={rateError !== null || dateError !== null || save.isPending}
          onClick={() => {
            if (rate === null || dateError) return
            const record = exchangeRateRecord.parse({
              from: currency,
              to: defaultCurrency,
              rate,
              date,
            })
            save.mutate([{ id: newId(), body: exchangeRateBody(record) }], { onSuccess: onClose })
          }}
        >
          {t('rates.save')}
        </Button>
      </SheetFooter>
      <ActionSheet
        open={removing !== null}
        title={
          removing
            ? t('rates.deleteTitle', { date: formatDay(removing.date, today, locale, words) })
            : ''
        }
        message={t('rates.deleteMessage')}
        cancelLabel={t('nav.cancel')}
        actions={[
          {
            label: t('rates.delete'),
            tone: 'danger',
            onSelect: () => {
              if (!removing) return
              const { id, ...record } = removing
              setRemoving(null)
              // DL-PAT-06: one rate is easy to bring back, so it goes at once, with Undo.
              save.mutate([{ id, body: { deleted: true, type: 'exchangeRate' } }], {
                onSuccess: () => {
                  undo({
                    message: t('rates.deleted'),
                    undo: () => {
                      save.mutate([
                        { id, body: exchangeRateBody(exchangeRateRecord.parse(record)) },
                      ])
                    },
                  })
                },
              })
            },
          },
        ]}
        onClose={() => {
          setRemoving(null)
        }}
      />
    </>
  )
}
