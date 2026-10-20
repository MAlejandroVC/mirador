import type { GoalPlan, PlanMonth } from '@repo/core'
import { type ReactNode, useState } from 'react'
import { IconTile } from '../../components/ui/icon-tile'
import { type Icon, PlusIcon } from '../../components/ui/icons'
import { List, ListButtonRow, ListLinkRow } from '../../components/ui/list'
import { SegmentedControl } from '../../components/ui/segmented-control'
import type { BudgetWords } from './budget-words'
import { goalDate } from './find-money-words'
import { GoalSheet } from './goal-sheet'
import { GoalTile } from './parts'
import type { Grouping } from './month-view'
import type { Budget } from './use-budget'

// What a month's page shares whether the month is tracked, made or planned ahead: its
// header card, the strip of income, budgeted and left over, the goal dates and the
// Type | Group switch.

/**
 * DL-CMP-06: a header card in the page, for a month being made or planned ahead: its
 * tile, "November budget" and one line of when it runs.
 */
export function MonthHeader({ icon, title, line }: { icon: Icon; title: string; line: string }) {
  return (
    <header className="flex flex-col items-start gap-1 rounded-[1.25rem] bg-surface p-4">
      <span className="mb-2">
        <IconTile icon={icon} size="large" />
      </span>
      <h2 className="text-[1.5rem] leading-tight font-bold text-text">{title}</h2>
      <p className="text-[0.9375rem] text-text-muted">{line}</p>
    </header>
  )
}

/** BUD-05, BUD-12: the income the month counts on, what it budgets and what's left over. */
export function PlanStrip({
  month,
  words,
}: {
  month: Pick<PlanMonth, 'income' | 'target' | 'leftOver'>
  words: BudgetWords
}) {
  const { t } = words
  return (
    <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-surface px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-text-muted">{t('budget.strip.income')}</dt>
        <dd>{words.amount(month.income, 'moss')}</dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-text-muted">{t('budget.strip.budgeted')}</dt>
        <dd>{words.amount(month.target)}</dd>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <dt className="text-xs text-text-muted">{t('budget.strip.leftOver')}</dt>
        <dd>{words.amount(month.leftOver)}</dd>
      </div>
    </dl>
  )
}

/** BUD-20: the row that starts a new goal, on the goals list and on any month's page. */
export function NewGoalRow({
  words,
  hint,
  onClick,
}: {
  words: BudgetWords
  /** The line under it while there are no goals yet. */
  hint?: boolean
  onClick: () => void
}) {
  const { t } = words
  return (
    <ListButtonRow
      leading={
        <span className="grid size-[2.125rem] place-items-center text-brand">
          <PlusIcon aria-hidden className="size-5" />
        </span>
      }
      title={t('budget.goals.new')}
      {...(hint ? { subtitle: t('budget.goals.newHint') } : {})}
      onClick={onClick}
    />
  )
}

/**
 * BUD-32: the goals a month pays for, each with the date its budget gives it. A goal can
 * start here too, so planning a month (a move, a trip) never means leaving it first.
 */
export function GoalDates({
  budget,
  plans,
  words,
  children,
}: {
  budget: Budget
  plans: readonly GoalPlan[]
  words: BudgetWords
  /** Rows after the goals, such as Find money. */
  children?: ReactNode
}) {
  const { t } = words
  const [creating, setCreating] = useState(false)
  return (
    <>
      <List label={t('budget.goals.title')}>
        {plans.map((plan) => (
          <ListLinkRow
            key={plan.goal.id}
            to="/budget/goal/$goalId"
            params={{ goalId: plan.goal.id }}
            leading={<GoalTile kind={plan.goal.kind} />}
            title={plan.goal.name}
            subtitle={goalDate(words, plan)}
          />
        ))}
        {children}
        <NewGoalRow
          words={words}
          hint={plans.length === 0}
          onClick={() => {
            setCreating(true)
          }}
        />
      </List>
      {/* A native dialog can't sit inside the list, so the sheet follows it. */}
      <GoalSheet
        open={creating}
        mode={{ kind: 'new' }}
        budget={budget}
        onClose={() => {
          setCreating(false)
        }}
      />
    </>
  )
}

export function GroupingSwitch({
  grouping,
  onChange,
  words,
}: {
  grouping: Grouping
  onChange: (next: Grouping) => void
  words: BudgetWords
}) {
  const { t } = words
  return (
    <SegmentedControl
      label={t('budget.grouping.label')}
      options={[
        { value: 'type', label: t('budget.grouping.type') },
        { value: 'group', label: t('budget.grouping.group') },
      ]}
      value={grouping}
      onChange={onChange}
    />
  )
}
