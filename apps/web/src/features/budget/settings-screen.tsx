import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { ChoiceRow } from '../../components/ui/choice-row'
import { DayOfMonthRow } from '../../components/ui/date-field'
import { FieldNote } from '../../components/ui/field-row'
import { IconTile } from '../../components/ui/icon-tile'
import { ChartPieSliceIcon } from '../../components/ui/icons'
import { List, ListLinkRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { useSaveRecords } from '../wallets/use-ledger'
import { useBudgetWords } from './budget-words'
import { budgetSettingsChange, currentPlan, planChange } from './records'
import { type Budget, useBudget } from './use-budget'

// SYS-02, SYS-09: Settings › Budget: the day months start, how far the starting amounts
// look back, the deepest cut Find money suggests and when a category counts as at risk,
// plus whole months left out of the starting amounts (BUD-03) and the one-offs (BUD-76).
// Each choice saves at once, as in Settings › Currency.
export function BudgetSettingsScreen() {
  const budget = useBudget()
  const back = useBack()
  const { t } = useTranslation()
  const card = {
    icon: <IconTile icon={ChartPieSliceIcon} size="large" />,
    description: t('budget.settings.description'),
  }
  return (
    <Page title={t('budget.settings.title')} back={back} card={card}>
      {budget && <Choices budget={budget} />}
    </Page>
  )
}

const lookbacks = [3, 6, 12] as const
const cuts = ['0.1', '0.15', '0.2', '0.25'] as const
const risks = ['0.05', '0.1', '0.15', '0.2'] as const

function Choices({ budget }: { budget: Budget }) {
  const words = useBudgetWords(budget.context.currency, budget.today)
  const { t } = words
  const save = useSaveRecords()
  const { settings } = budget
  const plan = currentPlan(budget.ledger)
  const percent = (value: string) => words.share(Number(value))
  const choose = (patch: Parameters<typeof budgetSettingsChange>[1]) => {
    save.mutate([budgetSettingsChange(budget.ledger, patch)])
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <List>
          <DayOfMonthRow
            label={t('budget.settings.startDay')}
            value={settings.startDay}
            onChange={(startDay) => {
              choose({ startDay })
            }}
          />
        </List>
        <FieldNote>{t('budget.settings.startDayHint')}</FieldNote>
      </div>

      {/* BUD-01: how many months the starting amounts are the average of. */}
      <div className="flex flex-col gap-1.5">
        <List label={t('budget.settings.lookback')}>
          <li className="p-2.5">
            <SegmentedControl
              label={t('budget.settings.lookback')}
              options={lookbacks.map((count) => ({
                value: String(count),
                label: t('budget.settings.months', { count }),
              }))}
              value={String(settings.lookback)}
              onChange={(value) => {
                choose({ lookback: Number(value) as (typeof lookbacks)[number] })
              }}
            />
          </li>
        </List>
        <FieldNote>{t('budget.settings.lookbackHint', { count: settings.lookback })}</FieldNote>
      </div>

      {/* BUD-03: whole months that weren't how the person usually lives, such as a move. */}
      {budget.usual.periods.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <List label={t('budget.settings.leftOut')}>
            {[...budget.usual.periods].reverse().map((period) => {
              const out = plan.exclusions.periods.includes(period.start)
              return (
                <ChoiceRow
                  key={period.start}
                  title={words.monthTitle(period)}
                  checked={out}
                  onToggle={() => {
                    const periods = out
                      ? plan.exclusions.periods.filter((start) => start !== period.start)
                      : [...plan.exclusions.periods, period.start].sort()
                    save.mutate([
                      planChange(budget.ledger, { exclusions: { ...plan.exclusions, periods } }),
                    ])
                  }}
                />
              )
            })}
          </List>
          <FieldNote>{t('budget.settings.leftOutHint')}</FieldNote>
        </div>
      )}

      {/* BUD-35: the deepest cut Find money suggests for one category. */}
      <div className="flex flex-col gap-1.5">
        <List label={t('budget.settings.maxCut')}>
          <li className="p-2.5">
            <SegmentedControl
              label={t('budget.settings.maxCut')}
              options={cuts.map((value) => ({ value, label: percent(value) }))}
              value={cuts.find((value) => Number(value) === settings.maxCut) ?? '0.15'}
              onChange={(value) => {
                choose({ maxCut: Number(value) })
              }}
            />
          </li>
        </List>
        <FieldNote>{t('budget.settings.maxCutHint')}</FieldNote>
      </div>

      {/* BUD-43: how far over its target a category may head before it is at risk. */}
      <div className="flex flex-col gap-1.5">
        <List label={t('budget.settings.atRisk')}>
          <li className="p-2.5">
            <SegmentedControl
              label={t('budget.settings.atRisk')}
              options={risks.map((value) => ({ value, label: percent(value) }))}
              value={risks.find((value) => Number(value) === settings.atRisk) ?? '0.1'}
              onChange={(value) => {
                choose({ atRisk: Number(value) })
              }}
            />
          </li>
        </List>
        <FieldNote>{t('budget.settings.atRiskHint')}</FieldNote>
      </div>

      {/* BUD-76: the one-offs the starting amounts leave out. */}
      {budget.usual.oneOffs.length > 0 && (
        <List>
          <ListLinkRow
            to="/budget/one-offs"
            title={t('budget.make.oneOffs')}
            trailing={
              <span className="text-[0.9375rem] text-text-muted tabular-nums">
                {budget.usual.oneOffs.filter((item) => !item.counted).length}
              </span>
            }
          />
        </List>
      )}

      {save.isError && <FieldNote error>{t('wallets.saveFailed')}</FieldNote>}
    </>
  )
}
