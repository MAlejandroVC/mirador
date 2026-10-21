import { type PlanLine, parseLineKey, upcoming } from '@repo/core'
import type { Taxonomy } from '../categories/lookups'
import type { BudgetWords } from './budget-words'
import type { Budget } from './use-budget'

// BUD-08: a plan line is a category, or one of its tags inside it.

/** "Restaurants", or "Restaurants · Work" for a tag line. */
export function lineName(budget: { lookups: Taxonomy }, key: string): string {
  const { categoryId, tagId } = parseLineKey(key)
  const category = budget.lookups.categories.get(categoryId)?.name ?? ''
  if (tagId === null) return category
  const tag = budget.lookups.tags.get(tagId)?.name ?? ''
  return `${category} · ${tag}`
}

/** A line's category and its group, for its tile and color. */
export function lineLook(budget: { lookups: Taxonomy }, key: string) {
  const { categoryId, tagId } = parseLineKey(key)
  const category = budget.lookups.categories.get(categoryId)
  const group = category ? budget.lookups.groupOf(category) : undefined
  const tag = tagId === null ? undefined : budget.lookups.tags.get(tagId)
  return { category, group, tag, color: group?.color ?? ('stone' as const) }
}

/**
 * A Commitment lands on its date, so it says whether it was paid or when it is due
 * rather than showing a bar (Alejandro's call, 2026-10-20). Paid once it reached most
 * of its target; a recurring one says when it is due.
 */
export function commitmentStatus(
  budget: Pick<Budget, 'ledger' | 'today' | 'month'>,
  line: Pick<PlanLine, 'categoryId' | 'spent' | 'target' | 'lastDate'>,
  words: Pick<BudgetWords, 't' | 'day'>,
) {
  const { t } = words
  const paid = line.spent > 0 && line.spent >= line.target * 0.9
  if (paid)
    return {
      paid,
      text: t('budget.lines.paid', { date: words.day(line.lastDate ?? budget.today) }),
    }
  const due = upcoming(budget.ledger.recurring, budget.today, budget.month.period.end).find(
    (item) => item.recurring.categoryId === line.categoryId,
  )
  return {
    paid,
    text: due ? t('budget.lines.due', { date: words.day(due.date) }) : t('budget.lines.notYet'),
  }
}
