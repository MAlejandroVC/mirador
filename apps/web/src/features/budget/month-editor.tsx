import {
  amountText,
  daysLeft,
  fractionDigits,
  parseAmount,
  pickableCategories,
  type PlanLine,
  type SuggestedCut,
} from '@repo/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '../../components/ui/button'
import { FieldNote, invalidRow, MoneyRow } from '../../components/ui/field-row'
import { CalendarDotsIcon, CalendarCheckIcon, CaretRightIcon } from '../../components/ui/icons'
import { List, ListButtonRow, ListLinkRow } from '../../components/ui/list'
import { MoneyInput } from '../../components/ui/money-input'
import { ShowMoreRow } from '../../components/ui/show-more-row'
import { useMoney } from '../../lib/format'
import { CategoryTile } from '../categories/category-tile'
import { newId, useSaveRecords } from '../wallets/use-ledger'
import type { BudgetWords } from './budget-words'
import { FindMoneySheet } from './find-money-sheet'
import { lineName } from './lines'
import { GoalDates, GroupingSwitch, MonthHeader, PlanStrip } from './month-parts'
import { type MonthView, sectionsOf, useGrouping } from './month-view'
import { monthChange } from './records'
import { type Budget, fundWith, periodOf, planFor, startsFrom } from './use-budget'

// BUD-70 to BUD-72: a month's budget being made or edited, right on its page, the same
// for this month and any month ahead. Every amount is a field that saves as soon as the
// person leaves it, the strip and the goal dates follow as it changes (BUD-32), and a
// draft becomes the month's budget with Lock in (BUD-71). An amount starts from the last
// budget before the month, or from the usual month without one-offs (BUD-01, BUD-02).

export function MonthEditor({
  budget,
  view,
  words,
  find,
  onLocked,
}: {
  budget: Budget
  view: MonthView
  words: BudgetWords
  /** BUD-35: open Find money at once, as when coming from a goal. */
  find: boolean
  onLocked: () => void
}) {
  const { t } = words
  const currency = budget.context.currency
  const money = useMoney(currency)
  const decimals = fractionDigits(currency)
  const save = useSaveRecords()
  const navigate = useNavigate()
  const [grouping, setGrouping] = useGrouping()
  const month = planFor(budget, view.period, { all: true })
  const reference = startsFrom(budget, view.start)
  // BUD-72: while editing a budget, each amount is compared with what it was when
  // editing began.
  const [was] = useState(() =>
    view.mode === 'edit' ? new Map(month.lines.map((line) => [line.key, line.base])) : null,
  )
  // What the person typed since the page opened; every other amount is the budget's.
  const [edits, setEdits] = useState<ReadonlyMap<string, string>>(new Map())
  const [incomeText, setIncomeText] = useState<string | null>(null)
  const [finding, setFinding] = useState(find)
  const [showAll, setShowAll] = useState(false)
  // BUD-06: with no history yet, every category shows, even once the first amount saves.
  const [fresh] = useState(!budget.ready)
  // Saves made before the first one is back land on the same record.
  const [id] = useState(newId)

  const parse = (text: string) => Math.max(0, parseAmount(text, currency, money.locale) ?? 0)
  const text = (minor: number) => (minor === 0 ? '' : amountText(minor, currency, money.locale))

  // BUD-06: every expense category can take an amount, even one with no history yet.
  const known = new Set(month.lines.map((line) => line.key))
  const others: PlanLine[] = pickableCategories(
    budget.ledger.categories,
    budget.ledger.groups,
    'expense',
  )
    .filter((category) => category.systemKey === undefined && !known.has(category.id))
    .map((category) => ({
      key: category.id,
      categoryId: category.id,
      tagId: null,
      flexibility: category.flexibility,
      groupId: category.groupId,
      base: 0,
      target: 0,
      starting: 0,
      carry: 0,
      spent: 0,
      left: 0,
      projected: 0,
      status: 'onTrack',
      lastDate: null,
      usual: null,
    }))
  // Largest usual month first, then in the person's order of categories (CAT-01), so a
  // row never moves as its amount changes.
  const order = (line: PlanLine) =>
    budget.ledger.categories.findIndex((category) => category.id === line.categoryId)
  const every = [...month.lines, ...others].sort(
    (a, b) =>
      b.starting - a.starting ||
      order(a) - order(b) ||
      (a.tagId ?? '').localeCompare(b.tagId ?? ''),
  )
  const valueOf = (line: PlanLine, from = edits) => {
    const typed = from.get(line.key)
    return typed === undefined ? line.base : parse(typed)
  }
  const income = incomeText === null ? month.income : parse(incomeText)
  const targets = (from = edits) =>
    new Map(every.map((line) => [line.key, valueOf(line, from)] as const))
  const budgeted = every.reduce((sum, line) => sum + Math.max(0, valueOf(line) + line.carry), 0)
  const leftOver = income - budgeted
  const funding = fundWith(budget, leftOver, budget.goals, view.period)

  const store = (
    next: ReadonlyMap<string, number>,
    amount: number,
    lock: 'keep' | 'lock' = 'keep',
    done?: () => void,
  ) => {
    save.mutate([monthChange(budget.ledger, view.start, next, amount, lock, id)], {
      ...(done ? { onSuccess: done } : {}),
    })
  }
  // A field saves as the person leaves it, only when its amount changed.
  const leave = (line: PlanLine) => {
    if (valueOf(line) !== line.base) store(targets(), income)
  }
  const leaveIncome = () => {
    if (income !== month.income) store(targets(), income)
  }
  // Starting over puts every amount back to where the draft starts from.
  const startOver = (from: ReadonlyMap<string, number>) => {
    const next = new Map(every.map((line) => [line.key, from.get(line.key) ?? 0] as const))
    setEdits(new Map())
    store(next, income)
  }
  const differs = (from: ReadonlyMap<string, number>) =>
    every.some((line) => valueOf(line) !== (from.get(line.key) ?? 0))
  const usual = new Map(every.map((line) => [line.key, line.starting] as const))

  const accept = (cuts: readonly SuggestedCut[], done: () => void) => {
    const next = new Map(edits)
    for (const cut of cuts) next.set(cut.line, text(cut.newTarget))
    setEdits(next)
    store(targets(next), income, 'keep', done)
  }

  const shown = fresh || showAll ? every : every.filter((line) => known.has(line.key))
  const sections = sectionsOf(budget, shown, grouping, words)
  const oneOffs = budget.usual.oneOffs
  const fromMonth = reference.from ? words.monthName(periodOf(budget, reference.from)) : null
  const name = words.monthName(view.period)
  const going = view.place === 'current'

  const note = (line: PlanLine) => {
    const value = valueOf(line)
    if (was) {
      const before = was.get(line.key) ?? 0
      return value === before ? undefined : t('budget.make.was', { amount: words.text(before) })
    }
    const start = reference.targets.get(line.key) ?? 0
    if (value === start) return undefined
    return fromMonth
      ? t('budget.make.was', { amount: words.text(start) })
      : t('budget.make.usual', { amount: words.text(start) })
  }

  return (
    <>
      <MonthHeader
        icon={view.mode === 'edit' ? CalendarCheckIcon : CalendarDotsIcon}
        title={t('budget.make.title', { month: name })}
        line={
          going
            ? t('budget.make.current', {
                from: words.day(view.period.start),
                to: words.day(view.period.end),
                count: daysLeft(view.period, budget.today),
              })
            : view.mode === 'edit'
              ? t('budget.ahead.line', { date: words.day(view.period.start) })
              : fromMonth
                ? t('budget.make.aheadFrom', {
                    date: words.day(view.period.start),
                    month: fromMonth,
                  })
                : t('budget.make.ahead', { date: words.day(view.period.start) })
        }
      />
      <PlanStrip month={{ income, target: budgeted, leftOver }} words={words} />

      {/* BUD-05: the income this month's budget counts on. */}
      <List label={t('budget.make.income')}>
        <MoneyRow
          label={t('budget.make.expected')}
          value={incomeText ?? text(month.income)}
          onChange={setIncomeText}
          onBlur={leaveIncome}
          locale={money.locale}
          decimals={decimals}
        />
      </List>

      <GroupingSwitch grouping={grouping} onChange={setGrouping} words={words} />
      {sections.map((section) =>
        section.lines.length === 0 ? null : (
          <List
            key={section.key}
            label={section.title}
            detail={words.text(
              section.lines.reduce((sum, line) => sum + Math.max(0, valueOf(line)), 0),
            )}
          >
            {section.lines.map((line) => (
              <AmountRow
                key={line.key}
                budget={budget}
                line={line}
                month={view.start}
                value={edits.get(line.key) ?? text(line.base)}
                note={note(line)}
                locale={money.locale}
                decimals={decimals}
                onChange={(value) => {
                  setEdits(new Map(edits).set(line.key, value))
                }}
                onBlur={() => {
                  leave(line)
                }}
              />
            ))}
          </List>
        ),
      )}

      <div className="flex flex-col gap-1.5">
        <List>
          {!fresh && others.length > 0 && (
            <ShowMoreRow
              open={showAll}
              more={t('budget.make.showAll', { count: others.length })}
              less={t('budget.make.hideOthers')}
              separator={false}
              onToggle={() => {
                setShowAll(!showAll)
              }}
            />
          )}
          {/* BUD-76: the one-offs left out of the starting amounts, to count any of them. */}
          {oneOffs.length > 0 && (
            <ListLinkRow
              to="/budget/one-offs"
              title={t('budget.make.oneOffs')}
              trailing={
                <span className="text-[0.9375rem] text-text-muted tabular-nums">
                  {oneOffs.filter((item) => !item.counted).length}
                </span>
              }
            />
          )}
          {/* BUD-06: with no history yet, past statements give the starting amounts. */}
          {fresh && (
            <ListLinkRow
              to="/settings/data"
              title={t('budget.make.import')}
              subtitle={t('budget.make.importHint')}
            />
          )}
          {/* BUD-70: back to the usual month, or to the budget the draft started from. */}
          {!fresh && differs(usual) && (
            <ListButtonRow
              title={t('budget.make.fromUsual')}
              onClick={() => {
                startOver(usual)
              }}
            />
          )}
          {fromMonth && differs(reference.targets) && view.mode === 'make' && (
            <ListButtonRow
              title={t('budget.make.fromMonth', { month: fromMonth })}
              onClick={() => {
                startOver(reference.targets)
              }}
            />
          )}
        </List>
        <FieldNote>
          {/* BUD-72: a locked month's edits count at once, so there is nothing to save. */}
          {view.mode === 'edit'
            ? t('budget.make.editHint')
            : fresh
              ? t('budget.make.hintNew')
              : fromMonth
                ? t('budget.make.hintFrom', { month: fromMonth })
                : t('budget.make.hint', { count: budget.settings.lookback })}
        </FieldNote>
      </div>

      {/* BUD-32: the goal dates as this budget leaves them, and a way to bring them in. */}
      <GoalDates budget={budget} plans={funding.goals} words={words}>
        {funding.gap > 0 && (
          <ListButtonRow
            leading={<span className="w-[2.125rem]" />}
            title={t('budget.find.row')}
            subtitle={t('budget.goals.gap', { amount: words.text(funding.gap) })}
            onClick={() => {
              setFinding(true)
            }}
          />
        )}
      </GoalDates>

      {save.isError && <FieldNote error>{t('budget.saveFailed')}</FieldNote>}

      {/* BUD-71: a draft becomes the month's budget only when the person locks it in. */}
      {view.mode === 'make' && (
        <div className="flex flex-col gap-1.5 pt-2">
          <Button
            disabled={save.isPending}
            onClick={() => {
              store(targets(), income, 'lock', onLocked)
            }}
          >
            {t('budget.make.lock', { month: name })}
          </Button>
          <p className="px-4 text-center text-[0.8125rem] text-text-muted">
            {t('budget.make.lockHint')}
          </p>
        </div>
      )}

      <FindMoneySheet
        open={finding}
        budget={budget}
        words={words}
        period={view.period}
        lines={every.map((line) => ({
          key: line.key,
          flexibility: line.flexibility,
          target: valueOf(line),
          spent: line.spent,
        }))}
        leftOver={leftOver}
        onAccept={accept}
        onClose={() => {
          setFinding(false)
          // Once closed, a reload or a step back does not open it again (DL-CMP-06).
          if (find)
            void navigate({
              to: '/budget',
              search: (previous) => {
                const next = { ...previous }
                delete next.find
                return next
              },
              replace: true,
            })
        }}
      />
    </>
  )
}

/**
 * DL-CMP-09 on a page: a category's amount as a row: its tile and name, what it was
 * when it changed, and the amount typed at the right with its caret only.
 */
/**
 * One amount of the month's budget. The field sets it right here; the rest of the row,
 * with its chevron, opens the line's page for that month, with what helps set it
 * (BUD-77), as a list row does (DL-CMP-07).
 */
function AmountRow({
  budget,
  line,
  month,
  value,
  note,
  locale,
  decimals,
  onChange,
  onBlur,
}: {
  budget: Budget
  line: PlanLine
  /** The month's first day, for the line's page. */
  month: string
  value: string
  note: string | undefined
  locale: string
  decimals: number
  onChange: (value: string) => void
  onBlur: () => void
}) {
  const category = budget.lookups.categories.get(line.categoryId)
  const group = category ? budget.lookups.groupOf(category) : undefined
  const name = lineName(budget, line.key)
  const link = {
    to: '/budget/line/$line',
    params: { line: line.key },
    search: { month },
  } as const
  return (
    <li className={`group flex min-h-[3.25rem] w-full items-stretch ${invalidRow}`}>
      <Link
        {...link}
        className="flex min-w-0 flex-1 items-center gap-3 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      >
        {category && <CategoryTile category={category} group={group} />}
        {/* DL-SHP-04: the hairline starts where the text starts. */}
        <span className="flex min-h-[3.25rem] min-w-0 flex-1 flex-col justify-center self-stretch border-t-[0.5px] border-separator py-2 group-first:border-t-0">
          <span className="truncate text-[0.9375rem] text-text">{name}</span>
          {note && <span className="text-[0.8125rem] text-text-muted">{note}</span>}
        </span>
      </Link>
      <span className="flex shrink-0 items-center gap-1 border-t-[0.5px] border-separator pr-2 group-first:border-t-0">
        <MoneyInput
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          locale={locale}
          decimals={decimals}
          aria-label={name}
          className="min-h-11 min-w-[4.5rem] shrink-0 justify-end pl-2 text-right text-[0.9375rem] text-text"
        />
        {/* The chevron opens the same page; the name already says where, for a screen reader. */}
        <Link {...link} aria-hidden tabIndex={-1} className="grid min-h-11 w-7 place-items-center">
          <CaretRightIcon className="size-4 text-text-faint" />
        </Link>
      </span>
    </li>
  )
}
