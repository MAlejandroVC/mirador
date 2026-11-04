import {
  closeTheGap,
  type GoalOffer,
  goalOffers,
  type Period,
  type PlanLine,
  type SuggestedCut,
} from '@repo/core'
import { useState } from 'react'
import { ChoiceRow } from '../../components/ui/choice-row'
import { FieldNote } from '../../components/ui/field-row'
import { List, ListButtonRow, ListRow } from '../../components/ui/list'
import { Sheet } from '../../components/ui/sheet'
import { SubmitButton } from '../../components/ui/submit-button'
import { useSubmit } from '../../components/ui/use-submit'
import { useSaveRecords } from '../wallets/use-ledger'
import type { BudgetWords } from './budget-words'
import { cutNote, goalMove } from './find-money-words'
import { lineName } from './lines'
import { GoalTile } from './parts'
import { goalChange } from './records'
import { type Budget, fundWith } from './use-budget'

// BUD-35, BUD-36: Find money for your goals, inside the month being made. It suggests
// spending a little less on some Wants, at most the largest cut each and never below
// the lowest recent month, says what each means as a habit (BUD-34) and what it does to
// the goals. The cuts the person keeps go into that month's budget, which the months
// after carry on (BUD-73). When the cuts can't cover the goals, a goal can ask for less.

export function FindMoneySheet({
  open,
  budget,
  words,
  period,
  lines,
  leftOver,
  onAccept,
  onClose,
}: {
  open: boolean
  budget: Budget
  words: BudgetWords
  period: Period
  /** The month's lines at their amounts as they stand now. */
  lines: readonly Pick<PlanLine, 'key' | 'flexibility' | 'target' | 'spent'>[]
  leftOver: number
  /** Puts the chosen cuts into the month's budget, then calls `done`. */
  onAccept: (cuts: readonly SuggestedCut[], done: () => void) => void
  onClose: () => void
}) {
  const { t } = words
  return (
    <Sheet
      open={open}
      title={t('budget.find.title')}
      cancelLabel={t('nav.cancel')}
      onClose={onClose}
    >
      {open && (
        <FindMoney
          budget={budget}
          words={words}
          period={period}
          lines={lines}
          leftOver={leftOver}
          onAccept={onAccept}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function FindMoney({
  budget,
  words,
  period,
  lines,
  leftOver,
  onAccept,
  onClose,
}: {
  budget: Budget
  words: BudgetWords
  period: Period
  lines: readonly Pick<PlanLine, 'key' | 'flexibility' | 'target' | 'spent'>[]
  leftOver: number
  onAccept: (cuts: readonly SuggestedCut[], done: () => void) => void
  onClose: () => void
}) {
  const { t } = words
  const save = useSaveRecords()
  const form = useSubmit()
  // Worked out once, so the list doesn't move while the person picks.
  const [before] = useState(() => fundWith(budget, leftOver, budget.goals, period))
  const [plan] = useState(() =>
    closeTheGap(lines, budget.usual.lines, before.gap, budget.settings.maxCut),
  )
  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(plan.cuts.map((cut) => cut.line)),
  )
  const cuts = plan.cuts.filter((cut) => chosen.has(cut.line))
  const freed = cuts.reduce((sum, cut) => sum + cut.cut, 0)
  const after = fundWith(budget, leftOver + freed, budget.goals, period)
  const moved = after.goals.flatMap((goalPlan) => {
    const note = goalMove(
      words,
      before.goals.find((item) => item.goal.id === goalPlan.goal.id),
      goalPlan,
    )
    return note ? [{ plan: goalPlan, note }] : []
  })
  // BUD-36: what the goals still lack once every cut is in.
  const offers = after.gap > 0 ? goalOffers(after, period, budget.settings.startDay) : []
  const usual = new Map(budget.usual.lines.map((line) => [line.key, line]))
  const month = words.monthName(period)

  const offerText = (offer: GoalOffer) => {
    const goal = budget.goals.find((item) => item.id === offer.change.goalId)
    const name = goal?.name ?? ''
    if (offer.change.by)
      return t('budget.find.offerLater', { name, date: words.monthYear(offer.change.by) })
    if (offer.change.perMonth !== undefined)
      return t('budget.find.offerMonthly', { name, amount: words.text(offer.change.perMonth) })
    return t('budget.find.offerLower', { name, amount: words.text(offer.change.target ?? 0) })
  }

  const takeOffer = (offer: GoalOffer) => {
    const goal = budget.ledger.goals.find((item) => item.id === offer.change.goalId)
    if (!goal) return
    const { id, ...record } = goal
    const { by, target, perMonth } = offer.change
    save.mutate([
      goalChange(id, {
        ...record,
        ...(by === undefined ? {} : { by }),
        ...(target === undefined ? {} : { target }),
        ...(perMonth === undefined ? {} : { perMonth }),
      }),
    ])
  }

  if (plan.cuts.length === 0 && before.gap <= 0)
    return (
      <p className="px-2 pt-2 pb-4 text-center text-[0.9375rem] text-text-muted">
        {t('budget.find.allFunded')}
      </p>
    )

  return (
    <>
      {/* DL-NUM-02: the one figure the sheet is about. */}
      <div className="flex flex-col items-center gap-1 py-2">
        <p>{words.figure(freed)}</p>
        <p className="text-[0.9375rem] text-text-muted">{t('budget.find.more')}</p>
      </div>

      {moved.length > 0 && (
        <List inset>
          {moved.map(({ plan: goalPlan, note }) => (
            <ListRow
              key={goalPlan.goal.id}
              leading={<GoalTile kind={goalPlan.goal.kind} />}
              title={goalPlan.goal.name}
              subtitle={note}
            />
          ))}
        </List>
      )}

      {plan.cuts.length > 0 && (
        <List inset label={t('budget.find.less')}>
          {plan.cuts.map((cut) => (
            <ChoiceRow
              key={cut.line}
              title={t('budget.find.cut', {
                name: lineName(budget, cut.line),
                amount: words.text(cut.newTarget),
              })}
              subtitle={cutNote(
                words,
                usual.get(cut.line),
                cut.newTarget + cut.cut,
                cut.newTarget,
                budget.usual.counted.length,
              )}
              checked={chosen.has(cut.line)}
              onToggle={() => {
                const next = new Set(chosen)
                if (next.has(cut.line)) next.delete(cut.line)
                else next.add(cut.line)
                setChosen(next)
              }}
            />
          ))}
        </List>
      )}

      {after.gap > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="px-4 text-[0.9375rem] text-text">
            {plan.cuts.length > 0
              ? t('budget.find.short', { amount: words.text(after.gap) })
              : t('budget.find.nothing', { amount: words.text(after.gap) })}
          </p>
          {offers.length > 0 && (
            <List inset label={t('budget.find.offers')}>
              {offers.map((offer) => (
                <ListButtonRow
                  key={`${offer.kind}-${offer.change.goalId}`}
                  title={offerText(offer)}
                  onClick={() => {
                    takeOffer(offer)
                  }}
                />
              ))}
            </List>
          )}
        </div>
      )}

      <FieldNote>
        {t('budget.find.rule', { percent: words.share(budget.settings.maxCut), month })}
      </FieldNote>

      <SubmitButton
        button={form.button}
        done={form.done}
        pending={save.isPending}
        onClick={() => {
          form.submit(true, () => {
            onAccept(cuts, () => {
              form.finish(onClose)
            })
          })
        }}
      >
        {t('budget.find.use', { month })}
      </SubmitButton>
    </>
  )
}
