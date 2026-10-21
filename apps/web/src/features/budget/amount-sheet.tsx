import { amountInput, fractionDigits, parseAmount } from '@repo/core'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AmountField } from '../../components/ui/amount-field'
import { Sheet } from '../../components/ui/sheet'
import { SubmitButton } from '../../components/ui/submit-button'
import { useSubmit } from '../../components/ui/use-submit'
import { useMoney } from '../../lib/format'

/** What an amount sheet asks for, and what happens with the amount. */
export interface AmountRequest {
  title: string
  /** One line above the amount, such as what the usual month is. */
  intro?: string
  label: string
  initial: number | null
  /** Zero is a real answer, such as sending nothing to a goal. */
  allowZero?: boolean
  /** Saves the amount, then calls `done`. */
  onSave: (minor: number, done: () => void) => void
  /** Something to pick beside the amount, such as which months it is for. */
  extra?: (amount: number | null) => ReactNode
  /** A tinted second action at the end, such as going back to the usual month. */
  secondary?: ReactNode
}

// DL-CMP-08, DL-CMP-09: one amount, typed as a big number in its own sheet, such as a
// category's target (BUD-04), the income expected (BUD-05) or money added to a goal
// (BUD-26). Save checks it only when tapped (DL-PAT-02).
export function AmountSheet({
  request,
  currency,
  pending,
  failed,
  onClose,
}: {
  request: AmountRequest | null
  currency: string
  pending: boolean
  failed: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  // Kept while the sheet slides away, so it leaves showing what it showed.
  const [shown, setShown] = useState(request)
  if (request && request !== shown) setShown(request)
  return (
    <Sheet
      open={request !== null}
      title={shown?.title ?? ''}
      cancelLabel={t('nav.cancel')}
      onClose={onClose}
    >
      {request && (
        <AmountForm
          request={request}
          currency={currency}
          pending={pending}
          failed={failed}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function AmountForm({
  request,
  currency,
  pending,
  failed,
  onClose,
}: {
  request: AmountRequest
  currency: string
  pending: boolean
  failed: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const money = useMoney(currency)
  const [text, setText] = useState(
    request.initial === null ? '' : amountInput(request.initial, currency, money.locale),
  )
  const form = useSubmit()
  const amount = parseAmount(text, currency, money.locale)
  const valid = amount !== null && (request.allowZero === true || amount > 0)
  const parts = money.parts({ minor: 0, currency })
  return (
    <>
      {request.intro && (
        <p className="px-2 text-center text-[0.9375rem] text-text-muted">{request.intro}</p>
      )}
      <AmountField
        label={request.label}
        value={text}
        onChange={setText}
        locale={money.locale}
        decimals={fractionDigits(currency)}
        prefix={parts.prefix.trim()}
        suffix={parts.suffix.trim()}
        error={form.tried && !valid ? t('budget.amountMissing') : null}
        autoFocus
      />
      {request.extra?.(amount)}
      <SubmitButton
        button={form.button}
        done={form.done}
        pending={pending}
        before={
          failed && (
            <p className="px-2 text-center text-[0.8125rem] text-warning">
              {t('budget.saveFailed')}
            </p>
          )
        }
        secondary={request.secondary}
        onClick={() => {
          form.submit(valid, () => {
            request.onSave(amount ?? 0, () => {
              form.finish(onClose)
            })
          })
        }}
      >
        {t('budget.save')}
      </SubmitButton>
    </>
  )
}
