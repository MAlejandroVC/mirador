import type { Flexibility, Goal, GoalPlan, PlanLine } from '@repo/core'
import { addDays, daysLeft } from '@repo/core'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { HeroCard } from '../../components/ui/hero-card'
import { IconTile } from '../../components/ui/icon-tile'
import {
  CalendarCheckIcon,
  CaretRightIcon,
  ClockCounterClockwiseIcon,
  ColumnsIcon,
  FlaskIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  TargetIcon,
} from '../../components/ui/icons'
import { List, ListButtonRow, ListLinkRow, ListRow } from '../../components/ui/list'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { ShowMoreRow } from '../../components/ui/show-more-row'
import { CategoryTile } from '../categories/category-tile'
import { useSaveRecords } from '../wallets/use-ledger'
import { AmountSheet, type AmountRequest } from './amount-sheet'
import { GoalReorderSheet } from './goal-reorder-sheet'
import { GoalSheet } from './goal-sheet'
import { contributedThisMonth } from './goal-math'
import { commitmentStatus, lineName } from './lines'
import { type BudgetWords, useBudgetWords } from './budget-words'
import { goalSummary } from './goal-summary'
import { GoalTile, Over, ProgressBar, ProgressRow } from './parts'
import { planChange } from './records'
import type { Budget } from './use-budget'

// Epic 6, the Plan side of Budget: what is left to spend this month and whether it is
// on track (BUD-41, BUD-43), what the month leaves over (BUD-12), the goals it pays for
// (BUD-20 to BUD-24), and every category's target against what it spent, grouped by
// Wants, Needs and Commitments or by category group. Then the way into what-ifs and
// past months.

const groupingKey = 'mirador.budget.grouping'
type Grouping = 'type' | 'group'

function savedGrouping(): Grouping {
  try {
    return globalThis.localStorage.getItem(groupingKey) === 'group' ? 'group' : 'type'
  } catch {
    return 'type'
  }
}

export function PlanView({ budget }: { budget: Budget }) {
  const words = useBudgetWords(budget.context.currency, budget.today)
  if (!budget.ready) return <FirstMonth budget={budget} words={words} />
  return (
    <>
      {budget.review && <ReviewCard budget={budget} words={words} />}
      <PlanHero budget={budget} words={words} />
      <PlanStrip budget={budget} words={words} />
      <GoalsList budget={budget} words={words} />
      <Categories budget={budget} words={words} />
      <MoreRows budget={budget} words={words} />
    </>
  )
}

/** BUD-06: less than a month to start from: import, enter rough amounts, or just track. */
function FirstMonth({ budget, words }: { budget: Budget; words: BudgetWords }) {
  const { t } = words
  // BUD-06: the plan is ready once this month is complete.
  const next = words.day(addDays(budget.month.period.end, 1))
  return (
    <>
      <EmptyState
        icon={TargetIcon}
        title={t('budget.first.title')}
        action={
          <Link
            to="/settings/data"
            className="mt-1 inline-flex min-h-[3.125rem] items-center justify-center rounded-[0.875rem] bg-brand px-6 text-[1.0625rem] font-semibold text-on-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t('budget.first.import')}
          </Link>
        }
      >
        {t('budget.first.body', { date: next })}
      </EmptyState>
      <div className="flex flex-col gap-1.5">
        <List>
          <ListLinkRow to="/budget/usual" title={t('budget.first.enter')} tone="brand" />
        </List>
        <p className="px-4 text-[0.8125rem] text-text-muted">{t('budget.first.enterHint')}</p>
      </div>
    </>
  )
}

/** BUD-50: once a month ends, a card offers its review until it is closed. */
function ReviewCard({ budget, words }: { budget: Budget; words: BudgetWords }) {
  const { t } = words
  const ended = budget.review
  if (!ended) return null
  return (
    <Link
      to="/budget/review"
      className="flex items-center gap-3 rounded-2xl bg-surface p-4 focus-visible:outline-2 focus-visible:outline-brand active:bg-fill"
    >
      <IconTile icon={CalendarCheckIcon} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[0.9375rem] font-semibold text-text">
          {t('budget.reviewCard.title', { month: words.monthName(ended) })}
        </span>
        <span className="text-[0.8125rem] text-text-muted">
          {t('budget.reviewCard.body', { month: words.monthName(budget.month.period) })}
        </span>
      </span>
      <CaretRightIcon aria-hidden className="size-4 shrink-0 text-text-faint" />
    </Link>
  )
}

/** DL-CMP-01, BUD-41, BUD-43: what is left to spend this month, and how it is going. */
function PlanHero({ budget, words }: { budget: Budget; words: BudgetWords }) {
  const { t } = words
  const { month } = budget
  const name = words.monthName(month.period)
  const days = daysLeft(month.period, budget.today)
  const over = month.left < 0
  const context = [
    t('budget.hero.of', { amount: words.text(month.target) }),
    t('budget.hero.days', { count: days }),
    ...(over ? [] : [t(`budget.status.${month.status}`)]),
  ].join(' · ')
  return (
    <HeroCard
      label={over ? t('budget.hero.over', { month: name }) : t('budget.hero.left', { month: name })}
      amount={words.hero(Math.abs(month.left))}
      context={context}
    />
  )
}

/** BUD-05, BUD-12: the income the plan counts on, what the plan spends and what's left over. */
function PlanStrip({ budget, words }: { budget: Budget; words: BudgetWords }) {
  const { t } = words
  const { month, ledger } = budget
  const save = useSaveRecords()
  const [request, setRequest] = useState<AmountRequest | null>(null)
  const name = words.monthName(month.period)

  const editIncome = () => {
    const usual = budget.usual.income ?? 0
    let only = false
    setRequest({
      title: t('budget.income.title'),
      intro: t('budget.income.intro', { amount: words.text(usual) }),
      label: t('budget.income.label'),
      initial: month.incomeSet ? month.income : usual,
      allowZero: true,
      extra: () => (
        <OnlyThisMonth
          month={name}
          onChange={(value) => {
            only = value
          }}
        />
      ),
      ...(month.incomeSet
        ? {
            secondary: (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  const byPeriod = (ledger.plan?.incomeByPeriod ?? []).filter(
                    (item) => item.start !== month.period.start,
                  )
                  save.mutate(
                    [planChange(ledger, { income: undefined, incomeByPeriod: byPeriod })],
                    {
                      onSuccess: () => {
                        setRequest(null)
                      },
                    },
                  )
                }}
              >
                {t('budget.income.usual')}
              </Button>
            ),
          }
        : {}),
      onSave: (amount, done) => {
        const byPeriod = (ledger.plan?.incomeByPeriod ?? []).filter(
          (item) => item.start !== month.period.start,
        )
        const change = only
          ? planChange(ledger, {
              incomeByPeriod: [...byPeriod, { start: month.period.start, amount }],
            })
          : planChange(ledger, { income: amount, incomeByPeriod: byPeriod })
        save.mutate([change], { onSuccess: done })
      },
    })
  }

  return (
    <>
      <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-surface px-1 py-1">
        <div className="flex">
          <button
            type="button"
            onClick={editIncome}
            className="flex min-h-11 flex-1 flex-col gap-0.5 rounded-xl px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-brand active:bg-fill"
          >
            <dt className="text-xs text-text-muted">
              {month.incomeSet ? t('budget.strip.expected') : t('budget.strip.usual')}
            </dt>
            <dd>{words.amount(month.income, 'moss')}</dd>
          </button>
        </div>
        <div className="flex flex-col gap-0.5 px-2 py-2">
          <dt className="text-xs text-text-muted">{t('budget.strip.plan')}</dt>
          <dd>{words.amount(month.target)}</dd>
        </div>
        <div className="flex flex-col items-end gap-0.5 px-3 py-2">
          <dt className="text-xs text-text-muted">{t('budget.strip.leftOver')}</dt>
          <dd>{words.amount(month.leftOver)}</dd>
        </div>
      </dl>
      <AmountSheet
        request={request}
        currency={budget.context.currency}
        pending={save.isPending}
        failed={save.isError}
        onClose={() => {
          setRequest(null)
        }}
      />
    </>
  )
}

/** BUD-05: an expected income for this month only, or for every month. */
function OnlyThisMonth({ month, onChange }: { month: string; onChange: (only: boolean) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState<'every' | 'only'>('every')
  return (
    <SegmentedControl
      label={t('budget.income.when')}
      options={[
        { value: 'every', label: t('budget.income.every') },
        { value: 'only', label: t('budget.income.only', { month }) },
      ]}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next === 'only')
      }}
    />
  )
}

/** BUD-20 to BUD-24, BUD-46: the goals in their order, each with its bar and its date. */
function GoalsList({ budget, words }: { budget: Budget; words: BudgetWords }) {
  const { t } = words
  const [creating, setCreating] = useState(false)
  const [ordering, setOrdering] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const { funding } = budget
  const open = budget.goals.filter((goal) => goal.done === undefined)
  const done = budget.goals.filter((goal) => goal.done !== undefined)
  const active = open.filter((goal) => !goal.paused && goal.kind !== 'afford')
  // BUD-46: what went into the goals this month, against what they need.
  const added = active.reduce(
    (sum, goal) => sum + Math.max(0, contributedThisMonth(budget, goal)),
    0,
  )

  return (
    <>
      <List
        label={t('budget.goals.title')}
        {...(funding.need > 0
          ? {
              detail: t('budget.goals.soFar', {
                added: words.text(added),
                need: words.text(funding.need),
              }),
            }
          : {})}
      >
        {open.map((goal) => (
          <GoalRow
            key={goal.id}
            budget={budget}
            goal={goal}
            plan={funding.goals.find((item) => item.goal.id === goal.id)}
            words={words}
          />
        ))}
        {showDone &&
          done.map((goal) => (
            <GoalRow key={goal.id} budget={budget} goal={goal} plan={undefined} words={words} />
          ))}
        {funding.gap > 0 && (
          <ListLinkRow
            to="/budget/what-if"
            search={{ gap: true }}
            leading={<span className="w-[2.125rem]" />}
            title={t('budget.goals.closeGap')}
            subtitle={t('budget.goals.gap', { amount: words.text(funding.gap) })}
            tone="brand"
          />
        )}
        <ListButtonRow
          leading={
            <span className="grid size-[2.125rem] place-items-center text-brand">
              <PlusIcon aria-hidden className="size-5" />
            </span>
          }
          title={t('budget.goals.new')}
          {...(open.length === 0 ? { subtitle: t('budget.goals.newHint') } : {})}
          onClick={() => {
            setCreating(true)
          }}
        />
        {open.length > 1 && (
          <ListButtonRow
            leading={<span className="w-[2.125rem]" />}
            title={t('budget.goals.order')}
            onClick={() => {
              setOrdering(true)
            }}
          />
        )}
        {done.length > 0 && (
          <ShowMoreRow
            open={showDone}
            more={t('budget.goals.showDone', { count: done.length })}
            less={t('budget.goals.hideDone')}
            separator
            onToggle={() => {
              setShowDone(!showDone)
            }}
          />
        )}
      </List>
      <GoalSheet
        open={creating}
        mode={{ kind: 'new' }}
        budget={budget}
        onClose={() => {
          setCreating(false)
        }}
      />
      <GoalReorderSheet
        open={ordering}
        goals={open}
        onClose={() => {
          setOrdering(false)
        }}
      />
    </>
  )
}

/** One goal: its name, date and bar, then how far it has come or what it lacks (BUD-23). */
export function GoalRow({
  budget,
  goal,
  plan,
  words,
}: {
  budget: Budget
  goal: Goal
  plan: GoalPlan | undefined
  words: BudgetWords
}) {
  const progress = budget.progress.get(goal.id) ?? 0
  const target = plan?.target ?? goal.target ?? null
  const summary = goalSummary(goal, plan, progress, target, words)
  return (
    <ProgressRow
      to="/budget/goal/$goalId"
      params={{ goalId: goal.id }}
      leading={<GoalTile kind={goal.kind} />}
      title={goal.name}
      value={summary.value}
      bar={
        goal.kind === 'afford' ? undefined : (
          <ProgressBar
            value={target ? progress / target : plan && plan.need > 0 ? plan.funded / plan.need : 0}
            color="sun"
          />
        )
      }
      {...(summary.note ? { note: summary.note } : {})}
    />
  )
}

const types: readonly Flexibility[] = ['flexible', 'fixed', 'locked']

/** BUD-41, BUD-43: every line of the plan, by Wants, Needs and Commitments or by group. */
function Categories({ budget, words }: { budget: Budget; words: BudgetWords }) {
  const { t } = words
  const [grouping, setGrouping] = useState<Grouping>(savedGrouping)
  const { lines } = budget.month

  const sections =
    grouping === 'type'
      ? types.map((type) => ({
          key: type,
          title: t(`categories.flexibility.${type}Plural`),
          lines: lines.filter((line) => line.flexibility === type),
        }))
      : budget.ledger.groups
          .map((group) => ({
            key: group.id,
            title: group.name,
            // In the person's order of categories (CAT-01), each tag line after its category.
            lines: lines
              .filter((line) => line.groupId === group.id)
              .sort((a, b) => order(a) - order(b) || (a.tagId ?? '').localeCompare(b.tagId ?? '')),
          }))
          .filter((section) => section.lines.length > 0)

  function order(line: PlanLine) {
    return budget.ledger.categories.findIndex((category) => category.id === line.categoryId)
  }

  return (
    <>
      <SegmentedControl
        label={t('budget.grouping.label')}
        options={[
          { value: 'type', label: t('budget.grouping.type') },
          { value: 'group', label: t('budget.grouping.group') },
        ]}
        value={grouping}
        onChange={(next) => {
          setGrouping(next)
          try {
            globalThis.localStorage.setItem(groupingKey, next)
          } catch {
            // Only this visit remembers it.
          }
        }}
      />
      {sections.map((section) => {
        if (section.lines.length === 0) return null
        const left = section.lines.reduce((sum, line) => sum + Math.max(0, line.left), 0)
        const detail =
          section.key !== 'locked'
            ? t('budget.lines.left', { amount: words.text(left) })
            : left > 0
              ? t('budget.lines.toGo', { amount: words.text(left) })
              : t('budget.lines.allPaid')
        return (
          <List key={section.key} label={section.title} detail={detail}>
            {section.lines.map((line) =>
              line.flexibility === 'locked' ? (
                <CommitmentRow key={line.key} budget={budget} line={line} words={words} />
              ) : (
                <LineRow key={line.key} budget={budget} line={line} words={words} />
              ),
            )}
          </List>
        )
      })}
      {lines.length === 0 && (
        <List>
          <ListRow title={<span className="text-text-muted">{t('budget.lines.none')}</span>} />
        </List>
      )}
    </>
  )
}

/** BUD-41 to BUD-43: a Want or a Need: left or over, its bar, and where its pace leads. */
function LineRow({ budget, line, words }: { budget: Budget; line: PlanLine; words: BudgetWords }) {
  const { t } = words
  const category = budget.lookups.categories.get(line.categoryId)
  const group = category ? budget.lookups.groupOf(category) : undefined
  const over = line.left < 0
  return (
    <ProgressRow
      to="/budget/line/$line"
      params={{ line: line.key }}
      leading={category ? <CategoryTile category={category} group={group} /> : null}
      title={lineName(budget, line.key)}
      value={
        over ? (
          <Over>{t('budget.lines.over', { amount: words.text(-line.left) })}</Over>
        ) : (
          t('budget.lines.left', { amount: words.text(line.left) })
        )
      }
      bar={
        <ProgressBar
          value={line.target > 0 ? line.spent / line.target : line.spent > 0 ? 1 : 0}
          color={group?.color ?? 'stone'}
        />
      }
      {...(line.status === 'atRisk'
        ? {
            note: (
              <Over>
                {t('budget.lines.atRisk', {
                  amount: words.text(line.projected - line.target),
                  date: words.day(budget.month.period.end),
                })}
              </Over>
            ),
          }
        : {})}
    />
  )
}

/** A Commitment: whether it was paid or when it is due, and its amount (BUD-41). */
function CommitmentRow({
  budget,
  line,
  words,
}: {
  budget: Budget
  line: PlanLine
  words: BudgetWords
}) {
  const category = budget.lookups.categories.get(line.categoryId)
  const group = category ? budget.lookups.groupOf(category) : undefined
  const status = commitmentStatus(budget, line, words)
  return (
    <ListLinkRow
      to="/budget/line/$line"
      params={{ line: line.key }}
      leading={category ? <CategoryTile category={category} group={group} /> : null}
      title={lineName(budget, line.key)}
      subtitle={status.text}
      trailing={words.amount(status.paid ? line.spent : line.target)}
    />
  )
}

/** BUD-30, BUD-38, BUD-57: the what-ifs and the months already closed. */
function MoreRows({ budget, words }: { budget: Budget; words: BudgetWords }) {
  const { t } = words
  const saved = budget.ledger.scenarios.length
  const closed = budget.ledger.snapshots.length
  return (
    <List>
      <ListLinkRow
        to="/budget/what-if"
        leading={<IconTile icon={FlaskIcon} />}
        title={t('budget.whatIf.title')}
        subtitle={t('budget.whatIf.row')}
      />
      {saved > 0 && (
        <ListLinkRow
          to="/budget/what-ifs"
          leading={<IconTile icon={ColumnsIcon} />}
          title={t('budget.saved.title')}
          subtitle={t('budget.saved.row', { count: saved })}
        />
      )}
      <ListLinkRow
        to="/budget/history"
        leading={<IconTile icon={ClockCounterClockwiseIcon} />}
        title={t('budget.history.title')}
        subtitle={
          closed > 0 ? t('budget.history.row', { count: closed }) : t('budget.history.none')
        }
      />
      {/* SYS-02, SYS-09: opened from here, Settings › Budget comes back here (DL-CMP-06). */}
      <ListLinkRow
        to="/settings/budget"
        leading={<IconTile icon={SlidersHorizontalIcon} />}
        title={t('budget.settings.title')}
        subtitle={t('budget.settings.row')}
      />
    </List>
  )
}
