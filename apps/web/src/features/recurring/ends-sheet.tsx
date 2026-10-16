import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChoiceRow } from '../../components/ui/choice-row'
import { DateRow } from '../../components/ui/date-field'
import { FieldNote, FieldRow, FieldRows } from '../../components/ui/field-row'
import { Fold } from '../../components/ui/fold'
import { List } from '../../components/ui/list'
import { Sheet } from '../../components/ui/sheet'
import type { Ends } from './labels'

// TXN-09: when it stops: never, on a date or after some times. Never closes the sheet;
// the other two open their field in place (DL-MOT-07), with Done.
export function EndsSheet({
  open,
  value,
  start,
  onChange,
  onClose,
}: {
  open: boolean
  value: Ends
  /** The first date; it can't end before it. */
  start: string
  onChange: (value: Ends) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [timesText, setTimesText] = useState(value.kind === 'after' ? String(value.times) : '12')
  const times = Number.parseInt(timesText, 10)
  const timesValid = Number.isInteger(times) && times >= 1 && times <= 999
  const date = value.kind === 'on' ? value.date : start

  return (
    <Sheet open={open} title={t('recurring.ends')} doneLabel={t('nav.done')} onClose={onClose}>
      <List inset>
        <ChoiceRow
          role="radio"
          title={t('recurring.endsOptions.never')}
          checked={value.kind === 'never'}
          onToggle={() => {
            onChange({ kind: 'never' })
            onClose()
          }}
        />
        <ChoiceRow
          role="radio"
          title={t('recurring.endsOptions.on')}
          checked={value.kind === 'on'}
          onToggle={() => {
            onChange({ kind: 'on', date })
          }}
        />
        <ChoiceRow
          role="radio"
          title={t('recurring.endsOptions.after')}
          checked={value.kind === 'after'}
          onToggle={() => {
            onChange({ kind: 'after', times: timesValid ? times : 12 })
          }}
        />
      </List>
      <Fold open={value.kind === 'on'}>
        <FieldRows>
          <DateRow
            label={t('recurring.endDate')}
            value={date}
            min={start}
            onChange={(next) => {
              onChange({ kind: 'on', date: next })
            }}
          />
        </FieldRows>
      </Fold>
      <Fold open={value.kind === 'after'}>
        <FieldRows
          note={!timesValid ? <FieldNote error>{t('recurring.timesMissing')}</FieldNote> : null}
        >
          <FieldRow
            label={t('recurring.times')}
            value={timesText}
            inputMode="numeric"
            maxLength={3}
            error={!timesValid}
            onChange={(event) => {
              const next = event.target.value.replace(/\D/g, '')
              setTimesText(next)
              const parsed = Number.parseInt(next, 10)
              if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 999)
                onChange({ kind: 'after', times: parsed })
            }}
          />
        </FieldRows>
      </Fold>
    </Sheet>
  )
}
