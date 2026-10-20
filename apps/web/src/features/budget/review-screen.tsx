import type { BudgetSnapshotRecord } from '@repo/api'
import {
  carryOver,
  type ClosedLine,
  changedTargets,
  contributedIn,
  goalProgress,
  keptTargets,
  missedInARow,
  type Period,
  type PlanLine,
  shiftPeriod,
  surplusByOrder,
  updatedTargets,
} from '@repo/core'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { EmptyState } from '../../components/ui/empty-state'
import { IconTile } from '../../components/ui/icon-tile'
import { CalendarCheckIcon } from '../../components/ui/icons'
import { List, ListButtonRow, ListRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { ShowMoreRow } from '../../components/ui/show-more-row'
import { Card } from '../analysis/parts'
import { CategoryTile } from '../categories/category-tile'
import { newId, type RecordChange, useSaveRecords } from '../wallets/use-ledger'
import { AmountSheet, type AmountRequest } from './amount-sheet'
import { type BudgetWords, useBudgetWords } from './budget-words'
import { lineLook, lineName } from './lines'
import { GoalTile, Over } from './parts'
import { contributionChange, currentPlan, planChange, snapshotChange } from './records'
import { type Budget, fundWith, planFor, useBudget } from './use-budget'

// BUD-50 to BUD-56: once a month ends, its review: the left over planned against the
// one lived, where the extra goes (BUD-51), how each category did, what going over did
// to the goals (BUD-53), an easier target for a Want that keeps missing (BUD-54), what
// carries over (BUD-52, off by default) and whether next month keeps these targets
// (BUD-55, Q8). "Start" closes the month and keeps it as it was (BUD-56).

/** How many rows a long list shows before "See all" (DL-CMP-15). */
const shownRows = 3

export function ReviewScreen() {
  const { t } = useTranslation()
  const back = useBack()
  const budget = useBudget()
  // The month under review, kept once shown: closing it clears budget.review before the
  // screen pops, and the screen keeps showing it until then.
  const [period, setPeriod] = useState<Period | null>(null)
  if (budget?.review && !period) setPeriod(budget.review)

  if (!budget) return <Page title="" back={back} />
  if (!period)
    return (
      <Page
        title={t('budget.review.titleNone')}
        back={back}
        card={{
          icon: <IconTile icon={CalendarCheckIcon} size="large" />,
          description: t('budget.review.description'),
        }}
      >
        {/* DL-CMP-14 */}
        <EmptyState icon={CalendarCheckIcon} title={t('budget.review.none')}>
          {t('budget.review.noneBody')}
        </EmptyState>
      </Page>
    )
  return <Review budget={budget} period={period} />
}

function Review({ budget, period }: { budget: Budget; period: Period }) {
  const words = useBudgetWords(budget.context.currency, budget.today)
  const { t } = words
  const back = useBack()
  const navigate = useNavigate()
  const save = useSaveRecords()
  const { ledger } = budget
  const next = shiftPeriod(period.start, 'month', 1, 0, budget.settings.startDay)
  const month = words.monthName(period)
  const nextMonth = words.monthName(next)

  // BUD-56: the month as it was when the review opened, so choices made here (an eased
  // target, kept targets) never rewrite it.
  const [closed] = useState(() => planFor(budget, period).month)
  const plannedLeftOver = closed.leftOver
  const actualLeftOver = closed.earned - closed.spent
  const extra = actualLeftOver - plannedLeftOver

  // BUD-51: goals that can take the extra, in their order.
  const goals = budget.goals.filter(
    (goal) => goal.done === undefined && !goal.paused && goal.kind !== 'afford',
  )
  const [amounts, setAmounts] = useState(() => {
    const unmet = goals.map((goal) => {
      const need = budget.funding.goals.find((plan) => plan.goal.id === goal.id)?.need ?? 0
      const added = contributedIn(goal, budget.contributions, budget.balances, period, budget.today)
      return { goalId: goal.id, unmet: need - added }
    })
    return new Map(surplusByOrder(extra, unmet).map((item) => [item.goalId, item.amount]))
  })
  const assigned = [...amounts.values()].reduce((sum, amount) => sum + amount, 0)
  const [request, setRequest] = useState<AmountRequest | null>(null)

  // BUD-54: the last three months, from their snapshots when they were closed.
  const [missed] = useState(() => {
    const months: ClosedLine[][] = [-2, -1].map((step) => {
      const earlier = shiftPeriod(period.start, 'month', step, 0, budget.settings.startDay)
      const snapshot = ledger.snapshots.find((item) => item.start === earlier.start)
      return snapshot
        ? snapshot.lines
        : planFor(budget, earlier).month.lines.map((line) => closedLine(line))
    })
    return missedInARow([...months, closed.lines.map((line) => closedLine(line))])
  })
  const [eased, setEased] = useState<ReadonlySet<string>>(new Set())
  const [carried, setCarried] = useState<ReadonlySet<string>>(new Set())
  const [targets, setTargets] = useState<'kept' | 'updated'>('kept')
  const [allLines, setAllLines] = useState(false)
  const [allCarry, setAllCarry] = useState(false)

  const lines = [...closed.lines].sort(
    (a, b) => Math.max(0, -b.left) - Math.max(0, -a.left) || Math.abs(b.left) - Math.abs(a.left),
  )
  const carryable = lines.filter((line) => line.left !== 0)
  const usual = new Map(budget.usual.lines.map((line) => [line.key, line.baseline]))
  const changed = changedTargets(closed.lines, usual)

  function start() {
    const changes: RecordChange[] = []
    // BUD-51: a goal without a wallet takes the money as a contribution on the month's
    // last day; one that follows a wallet grows once the money moves there.
    const surplus = goals.flatMap((goal) => {
      const amount = amounts.get(goal.id) ?? 0
      if (amount <= 0) return []
      if (goal.walletIds.length === 0)
        changes.push(contributionChange(newId(), { goalId: goal.id, amount, date: period.end }))
      return [{ goalId: goal.id, amount }]
    })
    // BUD-55, Q8: next month starts from these targets unless the person updates them;
    // BUD-54: an eased target is set by hand from next month on.
    const current = currentPlan(ledger).targets
    let nextTargets =
      targets === 'kept' ? keptTargets(closed.lines, current) : updatedTargets(current)
    for (const item of missed)
      if (eased.has(item.line))
        nextTargets = [
          ...nextTargets.filter((target) => target.line !== item.line),
          { line: item.line, amount: item.eased, byHand: true },
        ]
    changes.push(planChange(ledger, { targets: nextTargets }))

    const snapshot: BudgetSnapshotRecord = {
      start: period.start,
      end: period.end,
      lines: closed.lines.map((line) => closedLine(line)),
      income: { planned: Math.max(0, closed.income), actual: closed.earned },
      leftOver: { planned: plannedLeftOver, actual: actualLeftOver },
      goals: budget.goals
        .filter((goal) => goal.done === undefined && goal.kind !== 'afford')
        .map((goal) => {
          const plan = budget.funding.goals.find((item) => item.goal.id === goal.id)
          const sent = goal.walletIds.length === 0 ? (amounts.get(goal.id) ?? 0) : 0
          const target = plan?.target ?? goal.target
          return {
            goalId: goal.id,
            name: goal.name,
            progress: goalProgress(goal, budget.contributions, budget.balances, period.end) + sent,
            ...(target === undefined ? {} : { target }),
            contributed:
              contributedIn(goal, budget.contributions, budget.balances, period, budget.today) +
              sent,
            need: plan?.need ?? 0,
            ...(plan?.projected ? { projected: plan.projected } : {}),
          }
        }),
      surplus,
      // BUD-52: nothing carries over unless switched on.
      carry: carryOver(
        closed.lines.map((line) => closedLine(line)),
        carried,
      ),
      targets,
      closedAt: new Date().toISOString(),
    }
    changes.push(snapshotChange(newId(), snapshot))
    save.mutate(changes, {
      onSuccess: () => {
        if (back) back.onClick()
        else void navigate({ to: '/budget' })
      },
    })
  }

  return (
    <Page
      title={t('budget.review.title', { month })}
      back={back}
      card={{
        icon: <IconTile icon={CalendarCheckIcon} size="large" />,
        description: t('budget.review.description'),
      }}
    >
      {/* BUD-50: the left over planned against the one lived. */}
      <Card className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-text-muted">{t('budget.review.planned')}</dt>
            <dd>{words.amount(plannedLeftOver)}</dd>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <dt className="text-xs text-text-muted">{t('budget.review.actual')}</dt>
            <dd>{words.amount(actualLeftOver)}</dd>
          </div>
        </dl>
        <p className="text-[0.9375rem] text-text">
          {extra > 0
            ? t('budget.review.more', { amount: words.text(extra) })
            : extra < 0
              ? t('budget.review.less', { amount: words.text(-extra) })
              : t('budget.review.same')}
        </p>
      </Card>

      {/* BUD-51: the extra, filled in by goal order. */}
      {extra > 0 && goals.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <List label={t('budget.review.send', { amount: words.text(extra) })}>
            {goals.map((goal) => {
              const amount = amounts.get(goal.id) ?? 0
              return (
                <ListButtonRow
                  key={goal.id}
                  tone="text"
                  leading={<GoalTile kind={goal.kind} />}
                  title={goal.name}
                  trailing={words.amount(amount, amount > 0 ? undefined : 'muted')}
                  onClick={() => {
                    const available = extra - (assigned - amount)
                    setRequest({
                      title: goal.name,
                      intro: t('budget.review.upTo', { amount: words.text(available) }),
                      label: t('budget.review.toGoal'),
                      initial: amount,
                      allowZero: true,
                      onSave: (minor, done) => {
                        setAmounts(new Map(amounts).set(goal.id, Math.min(minor, available)))
                        done()
                      },
                    })
                  }}
                />
              )
            })}
            <ListRow
              title={t('budget.review.unassigned')}
              trailing={words.amount(Math.max(0, extra - assigned), 'muted')}
            />
          </List>
          <p className="px-4 text-[0.8125rem] text-text-muted">
            {goals.some((goal) => goal.walletIds.length > 0 && (amounts.get(goal.id) ?? 0) > 0)
              ? t('budget.review.walletHint')
              : t('budget.review.sendHint')}
          </p>
        </div>
      )}

      {/* BUD-50, BUD-55: target against spent, the ones that went over first. */}
      {lines.length > 0 && (
        <List label={t('budget.review.categories')}>
          {(allLines ? lines : lines.slice(0, shownRows)).map((line) => (
            <ResultRow key={line.key} budget={budget} line={line} words={words} />
          ))}
          {lines.length > shownRows && (
            <ShowMoreRow
              open={allLines}
              more={t('budget.review.allCategories', { count: lines.length })}
              less={t('budget.review.fewer')}
              separator
              onToggle={() => {
                setAllLines(!allLines)
              }}
            />
          )}
        </List>
      )}

      <OverEffect budget={budget} lines={closed.lines} leftOver={plannedLeftOver} words={words} />

      {/* BUD-54: a Want that keeps missing gets an easier target, with what it costs. */}
      {missed.slice(0, 2).map((item) => (
        <EaseCard
          key={item.line}
          budget={budget}
          item={item}
          eased={eased.has(item.line)}
          nextMonth={nextMonth}
          words={words}
          onToggle={() => {
            const set = new Set(eased)
            if (set.has(item.line)) set.delete(item.line)
            else set.add(item.line)
            setEased(set)
          }}
        />
      ))}

      {/* BUD-52: off by default, so next month starts fresh. */}
      {carryable.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <List label={t('budget.review.carryTitle', { month: nextMonth })}>
            {(allCarry ? carryable : carryable.slice(0, shownRows)).map((line) => (
              <ChoiceRow
                key={line.key}
                role="switch"
                title={lineName(budget, line.key)}
                subtitle={
                  line.left > 0
                    ? t('budget.review.carryAdd', { amount: words.text(line.left) })
                    : t('budget.review.carryTake', { amount: words.text(-line.left) })
                }
                checked={carried.has(line.key)}
                onToggle={() => {
                  const set = new Set(carried)
                  if (set.has(line.key)) set.delete(line.key)
                  else set.add(line.key)
                  setCarried(set)
                }}
              />
            ))}
            {carryable.length > shownRows && (
              <ShowMoreRow
                open={allCarry}
                more={t('budget.review.allCategories', { count: carryable.length })}
                less={t('budget.review.fewer')}
                separator
                onToggle={() => {
                  setAllCarry(!allCarry)
                }}
              />
            )}
          </List>
          <p className="px-4 text-[0.8125rem] text-text-muted">
            {t('budget.review.carryHint', { month: nextMonth })}
          </p>
        </div>
      )}

      {/* BUD-55, Q8: the targets stay unless the person moves them to the usual month. */}
      <List label={t('budget.review.targetsTitle', { month: nextMonth })}>
        <ChoiceRow
          role="radio"
          title={t('budget.review.keep', { month })}
          checked={targets === 'kept'}
          onToggle={() => {
            setTargets('kept')
          }}
        />
        <ChoiceRow
          role="radio"
          title={t('budget.review.update')}
          subtitle={
            changed > 0
              ? t('budget.review.changed', { count: changed })
              : t('budget.review.unchanged')
          }
          checked={targets === 'updated'}
          onToggle={() => {
            setTargets('updated')
          }}
        />
      </List>

      {save.isError && (
        <p role="alert" className="px-4 text-[0.8125rem] text-warning">
          {t('budget.review.failed')}
        </p>
      )}
      <Button
        className="mb-6"
        disabled={save.isPending}
        onClick={() => {
          start()
        }}
      >
        {t('budget.review.start', { month: nextMonth })}
      </Button>

      <AmountSheet
        request={request}
        currency={budget.context.currency}
        pending={false}
        failed={false}
        onClose={() => {
          setRequest(null)
        }}
      />
    </Page>
  )
}

/** A plan line as a snapshot keeps it (BUD-56). */
function closedLine(line: PlanLine): ClosedLine {
  return { line: line.key, flexibility: line.flexibility, target: line.target, spent: line.spent }
}

/** One category's month: what it spent of its target, and what was left or over. */
function ResultRow({
  budget,
  line,
  words,
}: {
  budget: Budget
  line: PlanLine
  words: BudgetWords
}) {
  const { t } = words
  const look = lineLook(budget, line.key)
  return (
    <ListRow
      leading={look.category ? <CategoryTile category={look.category} group={look.group} /> : null}
      title={lineName(budget, line.key)}
      subtitle={t('budget.review.of', {
        spent: words.text(line.spent),
        target: words.text(line.target),
      })}
      trailing={
        <span className="shrink-0 text-[0.9375rem] tabular-nums">
          {line.left < 0 ? (
            // DL-COL-05: over shows only in the words, in `warning`.
            <Over>{t('budget.review.over', { amount: words.text(-line.left) })}</Over>
          ) : (
            <span className="text-text-muted">
              {t('budget.review.left', { amount: words.text(line.left) })}
            </span>
          )}
        </span>
      }
    />
  )
}

/**
 * BUD-53: what going over did to the goals: the money it took, and the first goal that
 * would land later if every month went like this one.
 */
function OverEffect({
  budget,
  lines,
  leftOver,
  words,
}: {
  budget: Budget
  lines: readonly PlanLine[]
  leftOver: number
  words: BudgetWords
}) {
  const { t } = words
  const over = lines.filter((line) => line.left < 0)
  const total = over.reduce((sum, line) => sum - line.left, 0)
  if (total <= 0) return null
  const planned = fundWith(budget, leftOver)
  const hit = fundWith(budget, leftOver - total)
  const moved = hit.goals.find((plan) => {
    const before = planned.goals.find((item) => item.goal.id === plan.goal.id)
    if (!before?.projected) return false
    return plan.projected === null || plan.projected > before.projected
  })
  const before = moved && planned.goals.find((item) => item.goal.id === moved.goal.id)
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-[0.9375rem] text-text">
        {t('budget.review.overEffect', { count: over.length, amount: words.text(total) })}
      </p>
      <p className="text-[0.8125rem] text-text-muted">
        {moved && before?.projected
          ? moved.projected
            ? t('budget.review.overMoves', {
                goal: moved.goal.name,
                from: words.monthYear(before.projected),
                to: words.monthYear(moved.projected),
              })
            : t('budget.review.overStops', { goal: moved.goal.name })
          : t('budget.review.overKeeps')}
      </p>
    </Card>
  )
}

/** BUD-54: an easier target for a Want that missed three months running, and its cost. */
function EaseCard({
  budget,
  item,
  eased,
  nextMonth,
  words,
  onToggle,
}: {
  budget: Budget
  item: ReturnType<typeof missedInARow>[number]
  eased: boolean
  nextMonth: string
  words: BudgetWords
  onToggle: () => void
}) {
  const { t } = words
  const name = lineName(budget, item.line)
  // A higher target leaves that much less over each month for the goals.
  const after = fundWith(budget, budget.month.leftOver - (item.eased - item.target))
  const moved = after.goals.find((plan) => {
    const before = budget.funding.goals.find((each) => each.goal.id === plan.goal.id)
    if (!before?.projected) return false
    return plan.projected === null || plan.projected > before.projected
  })
  const amount = words.text(item.eased)
  return (
    <Card className="flex flex-col gap-1 pb-1.5">
      <p className="text-[0.9375rem] text-text">
        {t('budget.review.missed', { name, count: item.spent.length })}
      </p>
      <p className="text-[0.8125rem] text-text-muted">
        {eased
          ? t('budget.review.eased', { amount, month: nextMonth })
          : moved
            ? moved.projected
              ? t('budget.review.easeMoves', {
                  amount,
                  goal: moved.goal.name,
                  date: words.monthYear(moved.projected),
                })
              : t('budget.review.easeStops', { amount, goal: moved.goal.name })
            : t('budget.review.easeKeeps', { amount })}
      </p>
      <button
        type="button"
        aria-pressed={eased}
        onClick={onToggle}
        className="-mx-2 min-h-11 self-start rounded-lg px-2 text-[0.9375rem] text-brand focus-visible:outline-2 focus-visible:outline-brand"
      >
        {eased
          ? t('budget.review.keepTarget', { amount: words.text(item.target) })
          : t('budget.review.ease')}
      </button>
    </Card>
  )
}
