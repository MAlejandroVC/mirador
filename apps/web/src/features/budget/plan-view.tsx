import {
  daysLeft,
  type Goal,
  type GoalPlan,
  type MonthBudget,
  nextToPlan,
  type PlanLine,
  type PlanMonth,
  toCalendarDate,
} from '@repo/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { HeroCard } from '../../components/ui/hero-card'
import { IconTile } from '../../components/ui/icon-tile'
import { CalendarCheckIcon, CalendarDotsIcon, CaretRightIcon } from '../../components/ui/icons'
import { List, ListButtonRow, ListLinkRow, ListRow } from '../../components/ui/list'
import { ShowMoreRow } from '../../components/ui/show-more-row'
import { CategoryTile } from '../categories/category-tile'
import { type BudgetWords, useBudgetWords } from './budget-words'
import { contributedThisMonth } from './goal-math'
import { GoalReorderSheet } from './goal-reorder-sheet'
import { GoalSheet } from './goal-sheet'
import { goalSummary } from './goal-summary'
import { commitmentStatus, lineName } from './lines'
import { MonthBar } from './month-bar'
import { MonthEditor } from './month-editor'
import { GoalDates, GroupingSwitch, MonthHeader, NewGoalRow, PlanStrip } from './month-parts'
import { type MonthView, sectionsOf, useGrouping } from './month-view'
import { GoalTile, Over, ProgressBar, ProgressRow } from './parts'
import { type Budget, findMoneySearch, fundWith, periodOf, planFor } from './use-budget'

// Epic 6, the Plan side of Budget: one page for every month (BUD-70 to BUD-75). A month
// that isn't locked in yet, this one or one ahead, is made right here: every amount is
// a field, the goal dates move as they change, and Lock in makes it the month's budget.
// Once locked in, this month shows what is left to spend and whether it is on track
// (BUD-41, BUD-43), and Edit in the title row reopens its amounts (BUD-72). The month
// bar reaches past months with a budget too (BUD-57, BUD-74).

export function PlanView({
  budget,
  view,
  find,
}: {
  budget: Budget
  view: MonthView
  /** BUD-35: open Find money on the month being made. */
  find: boolean
}) {
  const words = useBudgetWords(budget.context.currency, budget.today)
  const navigate = useNavigate()
  // Moving between months changes what the page shows, not where it is, so it never
  // adds a step to go back through (DL-CMP-06).
  const go = (start: string) => {
    void navigate({
      to: '/budget',
      search: start === budget.view.period.start ? {} : { month: start },
      replace: true,
    })
  }
  return (
    <>
      <MonthBar budget={budget} start={view.start} words={words} onChange={go} />
      {view.place === 'current' && budget.review && <ReviewCard budget={budget} words={words} />}
      {view.mode === 'make' || view.mode === 'edit' ? (
        <MonthEditor
          key={view.start}
          budget={budget}
          view={view}
          words={words}
          find={find}
          onLocked={() => {
            globalThis.scrollTo({ top: 0 })
          }}
        />
      ) : view.mode === 'track' ? (
        <Tracking budget={budget} words={words} onPlan={go} />
      ) : view.mode === 'ahead' ? (
        <Ahead budget={budget} view={view} words={words} />
      ) : view.mode === 'past' ? (
        <Past budget={budget} view={view} words={words} />
      ) : (
        <EmptyState icon={CalendarDotsIcon} title={words.t('budget.past.none')}>
          {words.t('budget.past.noneBody', { month: words.monthName(view.period) })}
        </EmptyState>
      )}
    </>
  )
}

/** BUD-71: "Locked in on Oct 20.", or how a month that wasn't locked in got its budget. */
function lockedNote(budget: Budget, month: MonthBudget, words: BudgetWords): string {
  const { t } = words
  const lockedAt = month.record?.lockedAt
  if (month.state === 'locked' && lockedAt)
    return t('budget.track.lockedOn', { date: words.day(toCalendarDate(new Date(lockedAt))) })
  return month.from
    ? t('budget.track.carriedFrom', {
        month: words.monthName(periodOf(budget, month.from)),
      })
    : t('budget.track.carried')
}

/** BUD-41, BUD-43, BUD-75: this month against its budget, and the next one to lock in. */
function Tracking({
  budget,
  words,
  onPlan,
}: {
  budget: Budget
  words: BudgetWords
  onPlan: (start: string) => void
}) {
  const { month } = budget
  return (
    <>
      <PlanHero budget={budget} month={month} words={words} />
      {/* One card at a time: the review, which gets this month ready, comes first. */}
      {!budget.review && <NudgeCard budget={budget} words={words} onPlan={onPlan} />}
      <PlanStrip month={month} words={words} />
      <Categories
        budget={budget}
        month={month}
        words={words}
        row={(line) =>
          line.flexibility === 'locked' ? (
            <CommitmentRow key={line.key} budget={budget} line={line} words={words} />
          ) : (
            <LineRow key={line.key} budget={budget} month={month} line={line} words={words} />
          )
        }
      />
      <GoalsList budget={budget} words={words} />
      <p className="px-4 text-[0.8125rem] text-text-muted">
        {lockedNote(budget, budget.current, words)}
      </p>
    </>
  )
}

/** BUD-57: a past month against its budget, as it ended. */
function Past({ budget, view, words }: { budget: Budget; view: MonthView; words: BudgetWords }) {
  const month = planFor(budget, view.period)
  return (
    <>
      <PlanHero budget={budget} month={month} words={words} />
      <PlanStrip month={month} words={words} />
      <Categories
        budget={budget}
        month={month}
        words={words}
        row={(line) => (
          <LineRow
            key={line.key}
            budget={budget}
            month={month}
            line={line}
            words={words}
            start={view.start}
          />
        )}
      />
      <p className="px-4 text-[0.8125rem] text-text-muted">
        {lockedNote(budget, view.month, words)}
      </p>
    </>
  )
}

/** BUD-70, BUD-71: a month ahead, locked in: its amounts and what they do to the goals. */
function Ahead({ budget, view, words }: { budget: Budget; view: MonthView; words: BudgetWords }) {
  const { t } = words
  const month = planFor(budget, view.period)
  const funding = fundWith(budget, month.leftOver, budget.goals, view.period)
  return (
    <>
      <MonthHeader
        icon={CalendarCheckIcon}
        title={t('budget.make.title', { month: words.monthTitle(view.period) })}
        line={t('budget.ahead.line', { date: words.day(view.period.start) })}
      />
      <PlanStrip month={month} words={words} />
      <Categories
        budget={budget}
        month={month}
        words={words}
        detail={(lines) => words.text(lines.reduce((sum, line) => sum + line.target, 0))}
        row={(line) => {
          const category = budget.lookups.categories.get(line.categoryId)
          const group = category ? budget.lookups.groupOf(category) : undefined
          return (
            <ListLinkRow
              key={line.key}
              to="/budget/line/$line"
              params={{ line: line.key }}
              search={{ month: view.start }}
              leading={category ? <CategoryTile category={category} group={group} /> : null}
              title={lineName(budget, line.key)}
              trailing={words.amount(line.target)}
            />
          )
        }}
      />
      <GoalDates budget={budget} plans={funding.goals} words={words} />
      <p className="px-4 text-[0.8125rem] text-text-muted">{t('budget.ahead.hint')}</p>
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
          {t('budget.reviewCard.title', { month: words.monthTitle(ended) })}
        </span>
        <span className="text-[0.8125rem] text-text-muted">
          {t('budget.reviewCard.body', { month: words.monthName(budget.month.period) })}
        </span>
      </span>
      <CaretRightIcon aria-hidden className="size-4 shrink-0 text-text-faint" />
    </Link>
  )
}

/**
 * BUD-75: from 14 days before next month begins, while its budget isn't locked in, a
 * card asks for it, so the month starts with a budget already agreed.
 */
function NudgeCard({
  budget,
  words,
  onPlan,
}: {
  budget: Budget
  words: BudgetWords
  onPlan: (start: string) => void
}) {
  const { t } = words
  const next = nextToPlan(
    budget.ledger.months,
    budget.view.period,
    budget.today,
    budget.settings.startDay,
  )
  if (!next) return null
  const period = periodOf(budget, next.start)
  const drafted = budget.ledger.months.some((record) => record.start === next.start)
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <div className="flex items-center gap-3">
        <IconTile icon={CalendarDotsIcon} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-[0.9375rem] font-semibold text-text">
            {t('budget.nudge.title', { month: words.monthTitle(period), count: next.days })}
          </h2>
          <p className="text-[0.8125rem] text-text-muted">
            {drafted ? t('budget.nudge.drafted') : t('budget.nudge.body')}
          </p>
        </div>
      </div>
      <Button
        variant="secondary"
        onClick={() => {
          onPlan(next.start)
        }}
      >
        {t('budget.nudge.action', { month: words.monthName(period) })}
      </Button>
    </section>
  )
}

/** DL-CMP-01, BUD-41, BUD-43: what is left to spend in the month, and how it is going. */
function PlanHero({
  budget,
  month,
  words,
}: {
  budget: Budget
  month: PlanMonth
  words: BudgetWords
}) {
  const { t } = words
  const name = words.monthName(month.period)
  const going = budget.today <= month.period.end
  const over = month.left < 0
  const context = [
    t('budget.hero.of', { amount: words.text(month.target) }),
    ...(going ? [t('budget.hero.days', { count: daysLeft(month.period, budget.today) })] : []),
    ...(over || !going ? [] : [t(`budget.status.${month.status}`)]),
  ].join(' · ')
  return (
    <HeroCard
      label={over ? t('budget.hero.over', { month: name }) : t('budget.hero.left', { month: name })}
      amount={words.hero(Math.abs(month.left))}
      context={context}
    />
  )
}

/** BUD-20 to BUD-24, BUD-46: the goals in their order, each with its bar and its date. */
function GoalsList({ budget, words }: { budget: Budget; words: BudgetWords }) {
  const { t } = words
  const navigate = useNavigate()
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
        {/* BUD-35: Find money opens on this month's amounts, as Edit does. */}
        {funding.gap > 0 && (
          <ListButtonRow
            leading={<span className="w-[2.125rem]" />}
            title={t('budget.find.row')}
            subtitle={t('budget.goals.gap', { amount: words.text(funding.gap) })}
            onClick={() => {
              void navigate({ to: '/budget', search: findMoneySearch(budget), replace: true })
            }}
          />
        )}
        <NewGoalRow
          words={words}
          hint={open.length === 0}
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
function GoalRow({
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

/** BUD-41, BUD-43: every line of a month, by Wants, Needs and Commitments or by group. */
function Categories({
  budget,
  month,
  words,
  row,
  detail,
}: {
  budget: Budget
  month: PlanMonth
  words: BudgetWords
  row: (line: PlanLine) => ReactNode
  /** The figure at a section's right; what is left by default. */
  detail?: (lines: readonly PlanLine[], key: string) => string
}) {
  const { t } = words
  const [grouping, setGrouping] = useGrouping()
  const sections = sectionsOf(budget, month.lines, grouping, words)
  const left = (lines: readonly PlanLine[], key: string) => {
    const amount = lines.reduce((sum, line) => sum + Math.max(0, line.left), 0)
    if (key !== 'locked') return t('budget.lines.left', { amount: words.text(amount) })
    return amount > 0
      ? t('budget.lines.toGo', { amount: words.text(amount) })
      : t('budget.lines.allPaid')
  }
  return (
    <>
      <GroupingSwitch grouping={grouping} onChange={setGrouping} words={words} />
      {sections.map((section) =>
        section.lines.length === 0 ? null : (
          <List
            key={section.key}
            label={section.title}
            detail={(detail ?? left)(section.lines, section.key)}
          >
            {section.lines.map(row)}
          </List>
        ),
      )}
      {month.lines.length === 0 && (
        <List>
          <ListRow title={<span className="text-text-muted">{t('budget.lines.none')}</span>} />
        </List>
      )}
    </>
  )
}

/** BUD-41 to BUD-43: a Want or a Need: left or over, its bar, and where its pace leads. */
function LineRow({
  budget,
  month,
  line,
  words,
  start,
}: {
  budget: Budget
  month: PlanMonth
  line: PlanLine
  words: BudgetWords
  /** The month the row belongs to, when it isn't this one. */
  start?: string
}) {
  const { t } = words
  const category = budget.lookups.categories.get(line.categoryId)
  const group = category ? budget.lookups.groupOf(category) : undefined
  const over = line.left < 0
  return (
    <ProgressRow
      to="/budget/line/$line"
      params={{ line: line.key }}
      {...(start ? { search: { month: start } } : {})}
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
                  date: words.day(month.period.end),
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
