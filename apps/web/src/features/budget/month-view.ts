import {
  budgeted,
  budgetMonths,
  type Flexibility,
  type MonthBudget,
  type Period,
  type PlanLine,
  shiftPeriod,
} from '@repo/core'
import { useState } from 'react'
import type { BudgetWords } from './budget-words'
import { type Budget, type MonthPlace, monthOf, periodOf, placeOf } from './use-budget'

// Epic 6: which month the Plan page shows and how (BUD-70 to BUD-74), where its budget
// stands in words, and the Type | Group sections its lines fall in.

/** How the page shows a month. */
export type MonthMode =
  /** BUD-70: a draft, this month or one ahead, made in place. */
  | 'make'
  /** BUD-72: a month with a budget, its amounts open again. */
  | 'edit'
  /** BUD-41: this month against its budget. */
  | 'track'
  /** A month ahead, locked in. */
  | 'ahead'
  /** BUD-57: a past month against its budget. */
  | 'past'
  /** BUD-74: a past month without one. */
  | 'none'

export interface MonthView {
  start: string
  period: Period
  month: MonthBudget
  place: MonthPlace
  mode: MonthMode
}

/** The month the page shows, from the address; any other month falls back to this one. */
export function viewOf(budget: Budget, search: { month?: string; edit?: boolean }): MonthView {
  const current = budget.view.period.start
  const asked = search.month ? periodOf(budget, search.month).start : current
  const start = barMonths(budget).some((period) => period.start === asked) ? asked : current
  const month = monthOf(budget, start)
  const place = placeOf(budget, start)
  const mode: MonthMode =
    place === 'past'
      ? budgeted(month)
        ? 'past'
        : 'none'
      : month.state === 'draft'
        ? 'make'
        : search.edit
          ? 'edit'
          : place === 'current'
            ? 'track'
            : 'ahead'
  return { start, period: periodOf(budget, start), month, place, mode }
}

/** Where a month's budget stands, in a few words. */
export function monthState(budget: Budget, words: BudgetWords, month: MonthBudget): string {
  const { t } = words
  if (month.state === 'locked') return t('budget.bar.locked')
  if (month.state === 'carried')
    return month.from
      ? t('budget.bar.carriedFrom', { month: words.monthName(periodOf(budget, month.from)) })
      : t('budget.bar.carried')
  if (month.state === 'draft') return t('budget.bar.draft')
  return t('budget.bar.none')
}

/** Every month the bar moves through, oldest first. */
export function barMonths(budget: Budget): Period[] {
  const { first, last } = budgetMonths(
    budget.ledger.months,
    budget.view.period.start,
    budget.settings.startDay,
  )
  const months: Period[] = []
  for (let period = periodOf(budget, first); period.start <= last;) {
    months.push(period)
    period = shiftPeriod(period.start, 'month', 1, 0, budget.settings.startDay)
  }
  return months
}

const groupingKey = 'mirador.budget.grouping'
export type Grouping = 'type' | 'group'

function savedGrouping(): Grouping {
  try {
    return globalThis.localStorage.getItem(groupingKey) === 'group' ? 'group' : 'type'
  } catch {
    return 'type'
  }
}

const types: readonly Flexibility[] = ['flexible', 'fixed', 'locked']

/** The sections a month's lines fall in: Wants, Needs and Commitments, or category groups. */
export function sectionsOf(
  budget: Budget,
  lines: readonly PlanLine[],
  grouping: Grouping,
  words: BudgetWords,
) {
  const { t } = words
  const order = (line: PlanLine) =>
    budget.ledger.categories.findIndex((category) => category.id === line.categoryId)
  if (grouping === 'type')
    return types.map((type) => ({
      key: type,
      title: t(`categories.flexibility.${type}Plural`),
      lines: lines.filter((line) => line.flexibility === type),
    }))
  return budget.ledger.groups
    .map((group) => ({
      key: group.id,
      title: group.name,
      // In the person's order of categories (CAT-01), each tag line after its category.
      lines: lines
        .filter((line) => line.groupId === group.id)
        .sort((a, b) => order(a) - order(b) || (a.tagId ?? '').localeCompare(b.tagId ?? '')),
    }))
    .filter((section) => section.lines.length > 0)
}

/** BUD-10: the Type | Group switch, remembered on this device only. */
export function useGrouping() {
  const [grouping, setGrouping] = useState<Grouping>(savedGrouping)
  return [
    grouping,
    (next: Grouping) => {
      setGrouping(next)
      try {
        globalThis.localStorage.setItem(groupingKey, next)
      } catch {
        // Only this visit remembers it.
      }
    },
  ] as const
}
