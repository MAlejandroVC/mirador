import {
  addDays,
  amountInput,
  changedGoals,
  changedTarget,
  type Flexibility,
  flexibilityIn,
  fractionDigits,
  type GoalChange,
  type LineChange,
  parseAmount,
  parseDecimal,
  parseLineKey,
  perWeekAndYear,
  type Scenario,
} from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { DateRow } from '../../components/ui/date-field'
import { FieldNote, FieldRow, FieldRows, MoneyRow } from '../../components/ui/field-row'
import { IconTile } from '../../components/ui/icon-tile'
import {
  FlaskIcon,
  LockSimpleIcon,
  PlusIcon,
  ScissorsIcon,
  TargetIcon,
  TrendUpIcon,
} from '../../components/ui/icons'
import { List, ListButtonRow } from '../../components/ui/list'
import { NameField } from '../../components/ui/name-field'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet } from '../../components/ui/sheet'
import { SubmitButton } from '../../components/ui/submit-button'
import { useSubmit } from '../../components/ui/use-submit'
import { useMoney } from '../../lib/format'
import { CategoryTile } from '../categories/category-tile'
import { type BudgetWords, useBudgetWords } from './budget-words'
import { lineLook, lineName } from './lines'
import { GoalTile } from './parts'
import {
  targetBefore,
  tryScenario,
  whatIfLines,
  withChange,
  withGoalChange,
  withoutLine,
} from './scenario-math'
import type { Budget } from './use-budget'
import { goalEffect } from './what-if-words'

// BUD-30, BUD-31, BUD-33, BUD-11, BUD-37, BUD-39: the sheets a what-if is built with.
// Each changes only the what-if on screen; nothing is saved until the person saves it
// or uses it as the plan.

const kinds: readonly Flexibility[] = ['flexible', 'fixed', 'locked']

/** DL-CMP-07: a row of a picking list, in the text color with no chevron. */
function PickRow(props: Parameters<typeof ListButtonRow>[0]) {
  return <ListButtonRow tone="text" {...props} />
}

/** BUD-30, BUD-31: what kind of change to add, then which line or goal. */
export function AddChangeSheet({
  open,
  budget,
  scenario,
  onLine,
  onIncome,
  onGoal,
  onNewExpense,
  onClose,
}: {
  open: boolean
  budget: Budget
  scenario: Scenario
  onLine: (key: string) => void
  onIncome: () => void
  onGoal: (goalId: string) => void
  onNewExpense: () => void
  onClose: () => void
}) {
  const words = useBudgetWords(budget.context.currency, budget.today)
  const { t } = words
  const [step, setStep] = useState<'menu' | 'lines' | 'goals'>('menu')
  const [wasOpen, setWasOpen] = useState(open)
  // A new opening starts from the first step.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setStep('menu')
  }
  const goals = budget.funding.goals.map((plan) => plan.goal)
  const changedLines = new Set(scenario.changes.map((change) => change.line))
  const goalsChanged = new Set(scenario.goals.map((change) => change.goalId))
  const lines = whatIfLines(budget)
  const title =
    step === 'lines'
      ? t('budget.whatIf.addSheet.lines')
      : step === 'goals'
        ? t('budget.whatIf.addSheet.goals')
        : t('budget.whatIf.addSheet.title')
  return (
    <Sheet
      open={open}
      title={title}
      cancelLabel={t('nav.cancel')}
      {...(step === 'menu'
        ? {}
        : {
            back: {
              label: t('nav.back'),
              onClick: () => {
                setStep('menu')
              },
            },
          })}
      onClose={onClose}
    >
      {step === 'menu' && (
        <List inset>
          <PickRow
            leading={<IconTile icon={ScissorsIcon} />}
            title={t('budget.whatIf.addSheet.spending')}
            subtitle={t('budget.whatIf.addSheet.spendingHint')}
            onClick={() => {
              setStep('lines')
            }}
          />
          <PickRow
            leading={<IconTile icon={TrendUpIcon} />}
            title={t('budget.whatIf.addSheet.income')}
            subtitle={t('budget.whatIf.addSheet.incomeHint')}
            onClick={onIncome}
          />
          {goals.length > 0 && (
            <PickRow
              // DL-COL-09: goals take `sun`.
              leading={<IconTile icon={TargetIcon} color="sun" />}
              title={t('budget.whatIf.addSheet.goal')}
              subtitle={t('budget.whatIf.addSheet.goalHint')}
              onClick={() => {
                setStep('goals')
              }}
            />
          )}
          <PickRow
            leading={<IconTile icon={PlusIcon} />}
            title={t('budget.whatIf.addSheet.expense')}
            subtitle={t('budget.whatIf.addSheet.expenseHint')}
            onClick={onNewExpense}
          />
        </List>
      )}
      {step === 'lines' &&
        kinds.map((kind) => {
          const shown = lines.filter((line) => flexibilityIn(line, scenario) === kind)
          if (shown.length === 0) return null
          return (
            <List key={kind} inset label={t(`categories.flexibility.${kind}Plural`)}>
              {shown.map((line) => {
                const look = lineLook(budget, line.key)
                return (
                  <PickRow
                    key={line.key}
                    leading={
                      look.category ? (
                        <CategoryTile category={look.category} group={look.group} />
                      ) : undefined
                    }
                    title={lineName(budget, line.key)}
                    {...(changedLines.has(line.key)
                      ? { subtitle: t('budget.whatIf.addSheet.changed') }
                      : {})}
                    trailing={
                      <span className="flex items-center gap-1.5">
                        {/* BUD-33: a Commitment opens locked. */}
                        {kind === 'locked' && !scenario.unlocked.includes(line.key) && (
                          <LockSimpleIcon aria-hidden className="size-4 text-text-muted" />
                        )}
                        {words.amount(line.target)}
                      </span>
                    }
                    onClick={() => {
                      onLine(line.key)
                    }}
                  />
                )
              })}
            </List>
          )
        })}
      {step === 'goals' && (
        <List inset>
          {goals.map((goal) => (
            <PickRow
              key={goal.id}
              leading={<GoalTile kind={goal.kind} />}
              title={goal.name}
              {...(goalsChanged.has(goal.id)
                ? { subtitle: t('budget.whatIf.addSheet.changed') }
                : {})}
              onClick={() => {
                onGoal(goal.id)
              }}
            />
          ))}
        </List>
      )}
    </Sheet>
  )
}

interface LineDraft {
  kind: LineChange['kind']
  direction: 'less' | 'more'
  text: string
  /** BUD-11: the category's kind in this what-if. */
  flexibility: Flexibility
  /** BUD-33: a Commitment unlocked for this what-if. */
  unlocked: boolean
}

/**
 * BUD-30, BUD-33, BUD-34, BUD-11: one line changed by a share, an amount or to a new
 * target, with what that frees per week, month and year and the habit it means. A
 * Commitment asks to be unlocked first. A line with no target yet is a new expense,
 * which only takes an amount a month.
 */
export function LineChangeSheet({
  lineKey,
  seq,
  budget,
  scenario,
  onApply,
  onClose,
}: {
  lineKey: string | null
  seq: number
  budget: Budget
  scenario: Scenario
  onApply: (scenario: Scenario) => void
  onClose: () => void
}) {
  const { t } = useBudgetWords(budget.context.currency, budget.today)
  return (
    <Sheet
      open={lineKey !== null}
      title={lineKey ? lineName(budget, lineKey) : ''}
      cancelLabel={t('nav.cancel')}
      onClose={onClose}
    >
      {lineKey && (
        <LineChangeForm
          key={`${lineKey}:${String(seq)}`}
          lineKey={lineKey}
          budget={budget}
          scenario={scenario}
          onApply={onApply}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function LineChangeForm({
  lineKey,
  budget,
  scenario,
  onApply,
  onClose,
}: {
  lineKey: string
  budget: Budget
  scenario: Scenario
  onApply: (scenario: Scenario) => void
  onClose: () => void
}) {
  const currency = budget.context.currency
  const money = useMoney(currency)
  const words = useBudgetWords(currency, budget.today)
  const { t } = words
  const form = useSubmit()
  const line = budget.month.lines.find((item) => item.key === lineKey)
  const { categoryId } = parseLineKey(lineKey)
  const own = budget.lookups.categories.get(categoryId)?.flexibility ?? 'flexible'
  const before = targetBefore(budget, lineKey)
  const fresh = before === 0
  const existing = scenario.changes.find((change) => change.line === lineKey)
  const [draft, setDraft] = useState<LineDraft>(() => ({
    kind: fresh ? 'target' : (existing?.kind ?? 'percent'),
    direction: existing && existing.kind !== 'target' && existing.value > 0 ? 'more' : 'less',
    text: existing
      ? existing.kind === 'percent'
        ? String(Math.round(Math.abs(existing.value) * 100))
        : amountInput(Math.abs(existing.value), currency, money.locale)
      : fresh
        ? ''
        : // DL-PAT-02: start from the deepest step the app would suggest (BUD-35).
          String(Math.round(budget.settings.maxCut * 100)),
    flexibility:
      scenario.flexibility.find((item) => item.categoryId === categoryId)?.flexibility ?? own,
    unlocked: scenario.unlocked.includes(lineKey),
  }))
  const set = (patch: Partial<LineDraft>) => {
    setDraft({ ...draft, ...patch })
  }
  const locked = !fresh && draft.flexibility === 'locked' && !draft.unlocked
  const sign = draft.direction === 'less' ? -1 : 1

  // The change as typed, or null while it is missing.
  let value: number | null = null
  let tooMuch = false
  if (draft.kind === 'percent') {
    const percent = parseDecimal(draft.text, money.locale, 0)
    tooMuch = percent !== null && sign < 0 && percent > 100
    if (percent !== null && percent > 0 && !tooMuch) value = (sign * percent) / 100
  } else {
    const amount = parseAmount(draft.text, currency, money.locale)
    if (draft.kind === 'amount' && amount !== null && amount > 0) value = sign * amount
    if (draft.kind === 'target' && amount !== null && (amount > 0 || (!fresh && amount === 0)))
      value = amount
  }
  const change: LineChange | null =
    value === null ? null : { line: lineKey, kind: draft.kind, value }
  const after = change ? changedTarget(before, change) : null
  const delta = after === null ? 0 : before - after

  function apply() {
    let next = withoutLine(scenario, lineKey, categoryId)
    if (draft.flexibility !== own)
      next = {
        ...next,
        flexibility: [...next.flexibility, { categoryId, flexibility: draft.flexibility }],
      }
    if (draft.unlocked) next = { ...next, unlocked: [...next.unlocked, lineKey] }
    if (!locked && change && after !== before) next = withChange(next, change)
    onApply(next)
    form.finish(onClose)
  }

  return (
    <>
      <p className="px-2 text-center text-[0.9375rem] text-text-muted">
        {fresh
          ? t('budget.whatIf.changeSheet.newIntro')
          : line?.usual
            ? t('budget.whatIf.changeSheet.usual', {
                usual: words.text(line.usual.baseline),
                target: words.text(before),
              })
            : t('budget.whatIf.changeSheet.target', { target: words.text(before) })}
      </p>

      {locked ? (
        // BUD-33: a Commitment is unlocked for this what-if before it can change.
        <div className="flex flex-col gap-3 rounded-2xl bg-inset p-4">
          <p className="flex gap-2 text-[0.9375rem] text-text">
            <LockSimpleIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-text-muted" />
            {t('budget.whatIf.changeSheet.locked', { name: lineName(budget, lineKey) })}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              set({ unlocked: true })
            }}
          >
            {t('budget.whatIf.changeSheet.unlock')}
          </Button>
        </div>
      ) : (
        <>
          {!fresh && (
            <SegmentedControl
              label={t('budget.whatIf.changeSheet.how')}
              options={[
                { value: 'percent', label: t('budget.whatIf.changeSheet.percent') },
                { value: 'amount', label: t('budget.whatIf.changeSheet.amount') },
                { value: 'target', label: t('budget.whatIf.changeSheet.newTarget') },
              ]}
              value={draft.kind}
              onChange={(kind) => {
                set({
                  kind,
                  text:
                    kind === 'target'
                      ? amountInput(after ?? before, currency, money.locale)
                      : kind === draft.kind
                        ? draft.text
                        : '',
                })
              }}
            />
          )}
          {draft.kind !== 'target' && (
            <SegmentedControl
              label={t('budget.whatIf.changeSheet.direction')}
              options={[
                { value: 'less', label: t('budget.whatIf.changeSheet.less') },
                { value: 'more', label: t('budget.whatIf.changeSheet.more') },
              ]}
              value={draft.direction}
              onChange={(direction) => {
                set({ direction })
              }}
            />
          )}
          <FieldRows
            note={
              form.tried && change === null ? (
                <FieldNote error>
                  {tooMuch
                    ? t('budget.whatIf.changeSheet.tooMuch')
                    : t('budget.whatIf.changeSheet.missing')}
                </FieldNote>
              ) : null
            }
          >
            {draft.kind === 'percent' ? (
              <FieldRow
                label={t('budget.whatIf.changeSheet.percentLabel')}
                inputMode="numeric"
                suffix="%"
                value={draft.text}
                error={form.tried && change === null}
                onChange={(event) => {
                  set({ text: event.target.value })
                }}
              />
            ) : (
              <MoneyRow
                label={
                  draft.kind === 'amount'
                    ? t('budget.whatIf.changeSheet.amountLabel')
                    : t('budget.whatIf.changeSheet.targetLabel')
                }
                value={draft.text}
                onChange={(text) => {
                  set({ text })
                }}
                locale={money.locale}
                decimals={fractionDigits(currency)}
                error={form.tried && change === null}
              />
            )}
          </FieldRows>
          {after !== null && <ChangeResult words={words} after={after} delta={delta} />}
        </>
      )}

      {/* BUD-11: the category counts as another kind here only. */}
      {!fresh && !locked && (
        <List inset label={t('budget.whatIf.changeSheet.countsAs')}>
          {kinds.map((kind) => (
            <ChoiceRow
              key={kind}
              role="radio"
              title={t(`categories.flexibility.${kind}`)}
              subtitle={t(`categories.flexibility.${kind}Hint`)}
              checked={draft.flexibility === kind}
              onToggle={() => {
                set({ flexibility: kind })
              }}
            />
          ))}
        </List>
      )}

      <SubmitButton
        button={form.button}
        done={form.done}
        pending={false}
        onClick={() => {
          form.submit(locked || change !== null, apply)
        }}
      >
        {t('nav.done')}
      </SubmitButton>
      {existing && (
        <Button
          variant="ghost"
          onClick={() => {
            onApply(withoutLine(scenario, lineKey, categoryId))
            onClose()
          }}
        >
          {t('budget.whatIf.changeSheet.remove')}
        </Button>
      )}
    </>
  )
}

/** BUD-32, BUD-34: the new target, what it frees and the same per week and year. */
function ChangeResult({
  words,
  after,
  delta,
}: {
  words: BudgetWords
  after: number
  delta: number
}) {
  const { t } = words
  const { week, year } = perWeekAndYear(Math.abs(delta))
  return (
    <div className="flex flex-col gap-0.5 px-4 text-[0.8125rem] text-text-muted" aria-live="polite">
      <p className="text-[0.9375rem] text-text">
        {t('budget.whatIf.changeSheet.result', { amount: words.text(after) })}{' '}
        {delta === 0
          ? t('budget.whatIf.changeSheet.same')
          : t(delta > 0 ? 'budget.whatIf.changeSheet.frees' : 'budget.whatIf.changeSheet.costs', {
              amount: words.text(Math.abs(delta)),
            })}
      </p>
      {delta !== 0 && (
        <p>
          {t('budget.whatIf.changeSheet.perWeekYear', {
            week: words.text(week),
            year: words.text(year),
          })}
        </p>
      )}
    </div>
  )
}

/** BUD-31: a raise, side income or less coming in, each month. */
export function IncomeSheet({
  open,
  seq,
  budget,
  scenario,
  onApply,
  onClose,
}: {
  open: boolean
  seq: number
  budget: Budget
  scenario: Scenario
  onApply: (scenario: Scenario) => void
  onClose: () => void
}) {
  const { t } = useBudgetWords(budget.context.currency, budget.today)
  return (
    <Sheet
      open={open}
      title={t('budget.whatIf.incomeSheet.title')}
      cancelLabel={t('nav.cancel')}
      onClose={onClose}
    >
      {open && (
        <IncomeForm
          key={seq}
          budget={budget}
          scenario={scenario}
          onApply={onApply}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function IncomeForm({
  budget,
  scenario,
  onApply,
  onClose,
}: {
  budget: Budget
  scenario: Scenario
  onApply: (scenario: Scenario) => void
  onClose: () => void
}) {
  const currency = budget.context.currency
  const money = useMoney(currency)
  const words = useBudgetWords(currency, budget.today)
  const { t } = words
  const form = useSubmit()
  const existing = scenario.income ?? 0
  const [direction, setDirection] = useState<'more' | 'less'>(existing < 0 ? 'less' : 'more')
  const [text, setText] = useState(
    existing === 0 ? '' : amountInput(Math.abs(existing), currency, money.locale),
  )
  const amount = parseAmount(text, currency, money.locale)
  const valid = amount !== null && amount > 0
  const income = budget.month.income + (direction === 'less' ? -1 : 1) * (amount ?? 0)
  return (
    <>
      <p className="px-2 text-center text-[0.9375rem] text-text-muted">
        {t('budget.whatIf.incomeSheet.intro', { amount: words.text(budget.month.income) })}
      </p>
      <SegmentedControl
        label={t('budget.whatIf.incomeSheet.title')}
        options={[
          { value: 'more', label: t('budget.whatIf.incomeSheet.more') },
          { value: 'less', label: t('budget.whatIf.incomeSheet.less') },
        ]}
        value={direction}
        onChange={setDirection}
      />
      <FieldRows
        note={
          form.tried && !valid ? (
            <FieldNote error>{t('budget.whatIf.changeSheet.missing')}</FieldNote>
          ) : null
        }
      >
        <MoneyRow
          label={t('budget.whatIf.incomeSheet.label')}
          value={text}
          onChange={setText}
          locale={money.locale}
          decimals={fractionDigits(currency)}
          error={form.tried && !valid}
        />
      </FieldRows>
      {valid && (
        <p className="px-4 text-[0.9375rem] text-text" aria-live="polite">
          {t('budget.whatIf.incomeSheet.result', { amount: words.text(Math.max(0, income)) })}
        </p>
      )}
      <SubmitButton
        button={form.button}
        done={form.done}
        pending={false}
        onClick={() => {
          form.submit(valid, () => {
            const change = (direction === 'less' ? -1 : 1) * (amount ?? 0)
            onApply({ ...scenario, income: change })
            form.finish(onClose)
          })
        }}
      >
        {t('nav.done')}
      </SubmitButton>
      {existing !== 0 && (
        <Button
          variant="ghost"
          onClick={() => {
            onApply({ ...scenario, income: 0 })
            onClose()
          }}
        >
          {t('budget.whatIf.incomeSheet.remove')}
        </Button>
      )}
    </>
  )
}

/**
 * BUD-31: a goal's target, date or monthly amount in this what-if, with what it does
 * to the goal at the money left over (BUD-32). Its order stays as the goals list sets it.
 */
export function GoalChangeSheet({
  goalId,
  seq,
  budget,
  scenario,
  onApply,
  onClose,
}: {
  goalId: string | null
  seq: number
  budget: Budget
  scenario: Scenario
  onApply: (scenario: Scenario) => void
  onClose: () => void
}) {
  const { t } = useBudgetWords(budget.context.currency, budget.today)
  const goal = budget.goals.find((item) => item.id === goalId)
  return (
    <Sheet
      open={goalId !== null}
      title={goal?.name ?? ''}
      cancelLabel={t('nav.cancel')}
      onClose={onClose}
    >
      {goal && (
        <GoalForm
          key={`${goal.id}:${String(seq)}`}
          goalId={goal.id}
          budget={budget}
          scenario={scenario}
          onApply={onApply}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function GoalForm({
  goalId,
  budget,
  scenario,
  onApply,
  onClose,
}: {
  goalId: string
  budget: Budget
  scenario: Scenario
  onApply: (scenario: Scenario) => void
  onClose: () => void
}) {
  const currency = budget.context.currency
  const money = useMoney(currency)
  const words = useBudgetWords(currency, budget.today)
  const { t } = words
  const form = useSubmit()
  const goal = budget.goals.find((item) => item.id === goalId)
  const existing = scenario.goals.find((item) => item.goalId === goalId)
  const [current] = changedGoals(goal ? [goal] : [], existing ? [existing] : [])
  const [target, setTarget] = useState(
    current?.target === undefined ? '' : amountInput(current.target, currency, money.locale),
  )
  const [pace, setPace] = useState<'date' | 'month'>(
    current?.perMonth !== undefined || current?.kind === 'invest' ? 'month' : 'date',
  )
  const [by, setBy] = useState(current?.by ?? '')
  const [perMonth, setPerMonth] = useState(
    current?.perMonth === undefined ? '' : amountInput(current.perMonth, currency, money.locale),
  )
  if (!goal) return null

  // An emergency fund's target is its months of essentials (BUD-27), and an investment
  // that only repeats has none, so only goals with an amount of their own show it.
  const hasTarget = goal.target !== undefined && goal.months === undefined
  const typedTarget = parseAmount(target, currency, money.locale)
  const typedPerMonth = parseAmount(perMonth, currency, money.locale)
  const checks = {
    target: !hasTarget || (typedTarget !== null && typedTarget > 0),
    by: pace === 'month' || by > budget.today,
    perMonth: pace === 'date' || (typedPerMonth !== null && typedPerMonth > 0),
  }
  const complete = checks.target && checks.by && checks.perMonth

  // Only what differs from the goal itself goes in the what-if.
  const change: GoalChange = { goalId }
  if (hasTarget && typedTarget !== null && typedTarget !== goal.target) change.target = typedTarget
  if (pace === 'date' && by !== '' && by !== goal.by) change.by = by
  if (pace === 'month' && typedPerMonth !== null && typedPerMonth !== goal.perMonth)
    change.perMonth = typedPerMonth
  const changes = Object.keys(change).length > 1 ? change : null
  const next = withGoalChange(scenario, goalId, changes)
  const after = complete
    ? tryScenario(budget, next).funding.goals.find((plan) => plan.goal.id === goalId)
    : undefined
  const before = budget.funding.goals.find((plan) => plan.goal.id === goalId)

  return (
    <>
      <p className="px-2 text-center text-[0.9375rem] text-text-muted">
        {t('budget.whatIf.goalSheet.intro')}
      </p>
      {goal.kind !== 'invest' && (
        <SegmentedControl
          label={t('budget.whatIf.goalSheet.pace')}
          options={[
            { value: 'date', label: t('budget.whatIf.goalSheet.byDate') },
            { value: 'month', label: t('budget.whatIf.goalSheet.eachMonth') },
          ]}
          value={pace}
          onChange={setPace}
        />
      )}
      <FieldRows
        note={
          form.tried && !complete ? (
            <FieldNote error>{t('budget.whatIf.goalSheet.missing')}</FieldNote>
          ) : null
        }
      >
        {hasTarget && (
          <MoneyRow
            label={t('budget.whatIf.goalSheet.target')}
            value={target}
            onChange={setTarget}
            locale={money.locale}
            decimals={fractionDigits(currency)}
            error={form.tried && !checks.target}
          />
        )}
        {pace === 'date' ? (
          <DateRow
            label={t('budget.whatIf.goalSheet.by')}
            value={by}
            min={addDays(budget.today, 1)}
            error={form.tried && !checks.by}
            onChange={setBy}
          />
        ) : (
          <MoneyRow
            label={t('budget.whatIf.goalSheet.perMonth')}
            value={perMonth}
            onChange={setPerMonth}
            locale={money.locale}
            decimals={fractionDigits(currency)}
            error={form.tried && !checks.perMonth}
          />
        )}
      </FieldRows>
      {after && (
        <p className="flex items-center gap-2 px-4 text-[0.9375rem] text-text" aria-live="polite">
          {goalEffect(words, before, after)}
        </p>
      )}
      <SubmitButton
        button={form.button}
        done={form.done}
        pending={false}
        onClick={() => {
          form.submit(complete, () => {
            onApply(next)
            form.finish(onClose)
          })
        }}
      >
        {t('nav.done')}
      </SubmitButton>
      {existing && (
        <Button
          variant="ghost"
          onClick={() => {
            onApply(withGoalChange(scenario, goalId, null))
            onClose()
          }}
        >
          {t('budget.whatIf.goalSheet.remove')}
        </Button>
      )}
    </>
  )
}

/** BUD-38: a what-if's name, when it is saved or renamed. */
export function NameSheet({
  open,
  seq,
  title,
  initial,
  pending,
  failed,
  onSave,
  onClose,
}: {
  open: boolean
  seq: number
  title: string
  initial: string
  pending: boolean
  failed: boolean
  onSave: (name: string, done: () => void) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} title={title} cancelLabel={t('nav.cancel')} onClose={onClose}>
      {open && (
        <NameForm
          key={seq}
          initial={initial}
          pending={pending}
          failed={failed}
          onSave={onSave}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function NameForm({
  initial,
  pending,
  failed,
  onSave,
  onClose,
}: {
  initial: string
  pending: boolean
  failed: boolean
  onSave: (name: string, done: () => void) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const form = useSubmit()
  const [name, setName] = useState(initial)
  const valid = name.trim().length > 0
  return (
    <>
      <NameField
        tile={<IconTile icon={FlaskIcon} size="large" />}
        label={t('budget.whatIf.nameSheet.label')}
        placeholder={t('budget.whatIf.nameSheet.placeholder')}
        value={name}
        maxLength={80}
        error={form.tried && !valid ? t('budget.whatIf.nameSheet.missing') : null}
        onChange={setName}
      />
      <SubmitButton
        button={form.button}
        done={form.done}
        pending={pending}
        before={
          failed && (
            <p className="px-2 text-center text-[0.8125rem] text-warning">
              {t('budget.whatIf.saveFailed')}
            </p>
          )
        }
        onClick={() => {
          form.submit(valid, () => {
            onSave(name.trim(), () => {
              form.finish(onClose)
            })
          })
        }}
      >
        {t('budget.whatIf.nameSheet.save')}
      </SubmitButton>
    </>
  )
}

/** BUD-39: the month the plan starts following the what-if: this one or the next. */
export function UseSheet({
  open,
  seq,
  scenario,
  months,
  pending,
  failed,
  onUse,
  onClose,
}: {
  open: boolean
  seq: number
  scenario: Scenario
  months: {
    now: { start: string }
    next: { start: string }
    nowName: string
    nowTitle: string
    nextName: string
  }
  pending: boolean
  failed: boolean
  onUse: (from: string, done: () => void) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={open}
      title={t('budget.whatIf.useSheet.title')}
      cancelLabel={t('nav.cancel')}
      onClose={onClose}
    >
      {open && (
        <UseForm
          key={seq}
          scenario={scenario}
          months={months}
          pending={pending}
          failed={failed}
          onUse={onUse}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function UseForm({
  scenario,
  months,
  pending,
  failed,
  onUse,
  onClose,
}: {
  scenario: Scenario
  months: {
    now: { start: string }
    next: { start: string }
    nowName: string
    nowTitle: string
    nextName: string
  }
  pending: boolean
  failed: boolean
  onUse: (from: string, done: () => void) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const form = useSubmit()
  // The month under way keeps its plan unless the person picks it.
  const [from, setFrom] = useState(months.next.start)
  const cuts = scenario.changes.length > 0
  return (
    <>
      <List inset>
        <ChoiceRow
          role="radio"
          title={t('budget.whatIf.useSheet.now', { month: months.nowName })}
          subtitle={t('budget.whatIf.useSheet.nowHint')}
          checked={from === months.now.start}
          onToggle={() => {
            setFrom(months.now.start)
          }}
        />
        <ChoiceRow
          role="radio"
          title={t('budget.whatIf.useSheet.next', { month: months.nextName })}
          subtitle={t('budget.whatIf.useSheet.nextHint', { month: months.nowTitle })}
          checked={from === months.next.start}
          onToggle={() => {
            setFrom(months.next.start)
          }}
        />
      </List>
      {cuts && scenario.steps > 1 && (
        <FieldNote>{t('budget.whatIf.useSheet.phase', { count: scenario.steps })}</FieldNote>
      )}
      {scenario.goals.length > 0 && (
        <FieldNote>{t('budget.whatIf.useSheet.goals', { count: scenario.goals.length })}</FieldNote>
      )}
      <SubmitButton
        button={form.button}
        done={form.done}
        pending={pending}
        before={
          failed && (
            <p className="px-2 text-center text-[0.8125rem] text-warning">
              {t('budget.whatIf.saveFailed')}
            </p>
          )
        }
        onClick={() => {
          onUse(from, () => {
            form.finish(onClose)
          })
        }}
      >
        {t('budget.whatIf.useSheet.action')}
      </SubmitButton>
    </>
  )
}
