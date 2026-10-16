import { type Repeat, repeatPreset, repeatPresets, type RepeatUnit } from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChoiceRow } from '../../components/ui/choice-row'
import { FieldNote, FieldRow, FieldRows } from '../../components/ui/field-row'
import { Fold } from '../../components/ui/fold'
import { List } from '../../components/ui/list'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet } from '../../components/ui/sheet'

const presets = Object.keys(repeatPresets) as (keyof typeof repeatPresets)[]
const units: readonly RepeatUnit[] = ['day', 'week', 'month', 'year']

// TXN-09: how often it repeats: never, the usual ones, or every so many days, weeks,
// months or years. A usual one closes the sheet at once, like iOS's Repeat picker;
// Custom stays open for its numbers, with Done (DL-CMP-08).
export function RepeatSheet({
  open,
  value,
  allowNever,
  onChange,
  onClose,
}: {
  open: boolean
  value: Repeat | null
  /** A recurring transaction being changed always repeats; Stop repeating ends it. */
  allowNever: boolean
  onChange: (value: Repeat | null) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [custom, setCustom] = useState(value !== null && repeatPreset(value) === null)
  const [countText, setCountText] = useState(value ? String(value.count) : '2')
  const [unit, setUnit] = useState<RepeatUnit>(value?.unit ?? 'week')
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setCustom(value !== null && repeatPreset(value) === null)
      setCountText(value ? String(value.count) : '2')
      setUnit(value?.unit ?? 'week')
    }
  }
  const count = Number.parseInt(countText, 10)
  const countValid = Number.isInteger(count) && count >= 1 && count <= 99

  function pick(next: Repeat | null) {
    setCustom(false)
    onChange(next)
    onClose()
  }
  function customChange(nextCount: string, nextUnit: RepeatUnit) {
    setCountText(nextCount)
    setUnit(nextUnit)
    const parsed = Number.parseInt(nextCount, 10)
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 99)
      onChange({ unit: nextUnit, count: parsed })
  }

  return (
    <Sheet open={open} title={t('recurring.repeat')} doneLabel={t('nav.done')} onClose={onClose}>
      <List inset>
        {allowNever && (
          <ChoiceRow
            role="radio"
            title={t('recurring.never')}
            checked={!custom && value === null}
            onToggle={() => {
              pick(null)
            }}
          />
        )}
        {presets.map((preset) => (
          <ChoiceRow
            key={preset}
            role="radio"
            title={t(`recurring.presets.${preset}`)}
            checked={!custom && value !== null && repeatPreset(value) === preset}
            onToggle={() => {
              pick(repeatPresets[preset])
            }}
          />
        ))}
        <ChoiceRow
          role="radio"
          title={t('recurring.custom')}
          checked={custom}
          onToggle={() => {
            setCustom(true)
            customChange(countText, unit)
          }}
        />
      </List>
      {/* DL-MOT-07: the numbers open in place under Custom. */}
      <Fold open={custom}>
        <div className="flex flex-col gap-3">
          <FieldRows
            note={!countValid ? <FieldNote error>{t('recurring.everyMissing')}</FieldNote> : null}
          >
            <FieldRow
              label={t('recurring.every')}
              value={countText}
              inputMode="numeric"
              maxLength={2}
              error={!countValid}
              suffix={t(`recurring.units.${unit}`, { count: countValid ? count : 2 })}
              onChange={(event) => {
                customChange(event.target.value.replace(/\D/g, ''), unit)
              }}
            />
          </FieldRows>
          <SegmentedControl<RepeatUnit>
            label={t('recurring.every')}
            options={units.map((option) => ({
              value: option,
              label: t(`recurring.units.${option}`, { count: 2 }),
            }))}
            value={unit}
            onChange={(next) => {
              customChange(countText, next)
            }}
          />
        </div>
      </Fold>
    </Sheet>
  )
}
