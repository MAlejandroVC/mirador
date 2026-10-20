import { goalContributionRecordType, goalRecordType } from '@repo/api'
import { type Goal, type GoalPlan, monthsBetween } from '@repo/core'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { ActionSheet } from '../../components/ui/action-sheet'
import { Button } from '../../components/ui/button'
import { CaretRightIcon } from '../../components/ui/icons'
import { List, ListButtonRow, ListRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { useUndo } from '../../components/ui/use-undo'
import { Card } from '../analysis/parts'
import { newId, useSaveRecords } from '../wallets/use-ledger'
import { AmountSheet, type AmountRequest } from './amount-sheet'
import { type BudgetWords, useBudgetWords } from './budget-words'
import { affordFor, contributedThisMonth, debtPlan, planOf } from './goal-math'
import { GoalSheet } from './goal-sheet'
import { GoalTile, ProgressBar } from './parts'
import { contributionChange, deletion, goalChange } from './records'
import { type Budget, useBudget } from './use-budget'

// BUD-20 to BUD-28, BUD-46, BUD-60 to BUD-66: one goal: how far it has come and when it
// gets there at the money it gets (BUD-24), this month's part (BUD-46), money added by
// hand when it follows no wallet (BUD-26: "Add money" here, never a field on a
// transaction, Alejandro's call 2026-10-20), a debt's payoff (BUD-28) or what a purchase
// can cost (BUD-61 to BUD-66), then pause, done and delete.
export function GoalScreen({ goalId }: { goalId: string }) {
  const budget = useBudget()
  const back = useBack()
  const { t } = useTranslation()
  if (!budget) return <Page title="" back={back} />
  const record = budget.ledger.goals.find((goal) => goal.id === goalId)
  if (!record) return <Page title={t('budget.goalScreen.gone')} back={back} />
  return <GoalPage budget={budget} goal={record} back={back} />
}

function GoalPage({
  budget,
  goal,
  back,
}: {
  budget: Budget
  goal: Budget['ledger']['goals'][number]
  back: ReturnType<typeof useBack>
}) {
  const words = useBudgetWords(budget.context.currency, budget.today)
  const { t } = words
  const save = useSaveRecords()
  const undo = useUndo()
  const [editing, setEditing] = useState(false)
  const [request, setRequest] = useState<AmountRequest | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [entry, setEntry] = useState<string | null>(null)
  const plan = planOf(budget, goal.id)
  const progress = budget.progress.get(goal.id) ?? 0
  const added = budget.contributions
    .filter((item) => item.goalId === goal.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  const { id, ...record } = goal

  const update = (patch: Partial<typeof record>) => {
    save.mutate([goalChange(id, { ...record, ...patch })])
  }

  const remove = () => {
    setDeleting(false)
    save.mutate(
      [
        ...added.map((item) => deletion(item.id, goalContributionRecordType)),
        deletion(id, goalRecordType),
      ],
      {
        onSuccess: () => {
          back?.onClick()
          // DL-PAT-06: one goal goes at once, with a way back.
          undo({
            message: t('budget.goalScreen.deleted', { name: goal.name }),
            undo: () => {
              save.mutate([
                goalChange(id, record),
                ...added.map(({ id: itemId, ...item }) => contributionChange(itemId, item)),
              ])
            },
          })
        },
      },
    )
  }

  // BUD-26: money added by hand, or taken out, dated today.
  const addMoney = () => {
    let out = false
    setRequest({
      title: t('budget.goalScreen.addTitle'),
      intro: t('budget.goalScreen.addIntro', { name: goal.name }),
      label: t('budget.goalScreen.amount'),
      initial: null,
      extra: () => (
        <InOrOut
          onChange={(value) => {
            out = value
          }}
        />
      ),
      onSave: (amount, done) => {
        save.mutate(
          [
            contributionChange(newId(), {
              goalId: goal.id,
              amount: out ? -amount : amount,
              date: budget.today,
            }),
          ],
          { onSuccess: done },
        )
      },
    })
  }

  const linked = goal.walletIds.length > 0
  const walletNames = goal.walletIds
    .map((walletId) => budget.ledger.wallets.find((wallet) => wallet.id === walletId)?.name)
    .filter((name): name is string => name !== undefined)

  return (
    <Page
      title={goal.name}
      back={back}
      actions={
        <button
          type="button"
          onClick={() => {
            setEditing(true)
          }}
          className="min-h-11 rounded-xl px-2 text-[1.0625rem] text-brand focus-visible:outline-2 focus-visible:outline-brand"
        >
          {t('budget.goalScreen.edit')}
        </button>
      }
      card={{
        icon: <GoalTile kind={goal.kind} size="large" />,
        description: describe(goal, words, budget.essentials),
      }}
    >
      {goal.kind === 'afford' ? (
        <Afford budget={budget} goal={goal} words={words} />
      ) : (
        <>
          <Progress goal={goal} plan={plan} progress={progress} words={words} />
          {goal.done === undefined && !goal.paused && plan && (
            <ThisMonth budget={budget} goal={goal} plan={plan} words={words} />
          )}
          {goal.kind === 'debt' && <Debt budget={budget} goal={goal} words={words} />}
          {linked ? (
            <p className="px-4 text-[0.8125rem] text-text-muted">
              {goal.kind === 'debt'
                ? t('budget.goalScreen.debtFollows', {
                    wallet: walletNames.join(', '),
                    date: words.day(goal.start),
                  })
                : t('budget.goalScreen.follows', {
                    wallets: walletNames.join(', '),
                    date: words.day(goal.start),
                  })}
            </p>
          ) : (
            <>
              <Button onClick={addMoney}>{t('budget.goalScreen.add')}</Button>
              {added.length > 0 && (
                <List label={t('budget.goalScreen.added')}>
                  {added.slice(0, 12).map((item) => (
                    <ListButtonRow
                      key={item.id}
                      tone="text"
                      title={words.day(item.date)}
                      trailing={words.amount(item.amount)}
                      onClick={() => {
                        setEntry(item.id)
                      }}
                    />
                  ))}
                </List>
              )}
            </>
          )}
        </>
      )}

      <List>
        {goal.done === undefined && (
          <ListButtonRow
            title={goal.paused ? t('budget.goalScreen.resume') : t('budget.goalScreen.pause')}
            {...(goal.paused ? {} : { subtitle: t('budget.goalScreen.pauseHint') })}
            onClick={() => {
              update({ paused: goal.paused ? undefined : true })
            }}
          />
        )}
        {goal.kind !== 'afford' && (
          <ListButtonRow
            title={
              goal.done === undefined
                ? t('budget.goalScreen.markDone')
                : t('budget.goalScreen.markOpen')
            }
            onClick={() => {
              update({ done: goal.done === undefined ? budget.today : undefined })
            }}
          />
        )}
      </List>

      <Button
        variant="danger"
        onClick={() => {
          if (added.length > 0) setDeleting(true)
          else remove()
        }}
      >
        {t('budget.goalScreen.delete')}
      </Button>

      <GoalSheet
        open={editing}
        mode={{ kind: 'edit', goal }}
        budget={budget}
        onClose={() => {
          setEditing(false)
        }}
      />
      <AmountSheet
        request={request}
        currency={budget.context.currency}
        pending={save.isPending}
        failed={save.isError}
        onClose={() => {
          setRequest(null)
        }}
      />
      {/* DL-PAT-06: deleting a goal takes the money added to it with it. */}
      <ActionSheet
        open={deleting}
        title={t('budget.goalScreen.deleteTitle', { name: goal.name })}
        message={t('budget.goalScreen.deleteMessage', { count: added.length })}
        actions={[{ label: t('budget.goalScreen.delete'), tone: 'danger', onSelect: remove }]}
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          setDeleting(false)
        }}
      />
      <ActionSheet
        open={entry !== null}
        title={t('budget.goalScreen.entryTitle')}
        message={t('budget.goalScreen.entryMessage')}
        actions={[
          {
            label: t('budget.goalScreen.entryDelete'),
            tone: 'danger',
            onSelect: () => {
              const item = added.find((each) => each.id === entry)
              setEntry(null)
              if (!item) return
              const { id: itemId, ...data } = item
              save.mutate([deletion(itemId, goalContributionRecordType)], {
                onSuccess: () => {
                  undo({
                    message: t('budget.goalScreen.entryDeleted'),
                    undo: () => {
                      save.mutate([contributionChange(itemId, data)])
                    },
                  })
                },
              })
            },
          },
        ]}
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          setEntry(null)
        }}
      />
    </Page>
  )
}

/** The header card's line: the kind and how the goal is paced. */
function describe(goal: Goal, words: BudgetWords, essentials: number) {
  const { t } = words
  switch (goal.kind) {
    case 'afford':
      return t('budget.goalScreen.describe.afford', {
        date: goal.purchase ? words.day(goal.purchase.date) : '',
      })
    case 'emergency':
      return t('budget.goalScreen.describe.emergency', {
        count: goal.months ?? 0,
        amount: words.text((goal.months ?? 0) * essentials),
      })
    default:
      return goal.by
        ? t(`budget.goalScreen.describe.${goal.kind}By`, { date: words.monthYear(goal.by) })
        : t(`budget.goalScreen.describe.${goal.kind}Each`, {
            amount: words.text(goal.perMonth ?? 0),
          })
  }
}

/** DL-VIZ-01: how far it has come, as a bar and one sentence, and when it gets there. */
function Progress({
  goal,
  plan,
  progress,
  words,
}: {
  goal: Goal
  plan: GoalPlan | undefined
  progress: number
  words: BudgetWords
}) {
  const { t } = words
  const target = plan?.target ?? goal.target ?? null
  let sentence: string
  if (goal.done !== undefined)
    sentence = t('budget.goalScreen.doneOn', { date: words.day(goal.done) })
  else if (goal.paused) sentence = t('budget.goalScreen.paused')
  else if (!plan) sentence = ''
  else if (plan.funding === 'reached') sentence = t('budget.goalScreen.reached')
  else if (plan.projected === null)
    // A goal with a date can move it; one paid a month at a time can only get more.
    sentence =
      target === null
        ? t('budget.goalScreen.ongoing')
        : goal.by
          ? t('budget.goalScreen.never')
          : t('budget.goalScreen.neverEach')
  else if (goal.by && plan.projected > goal.by)
    // BUD-24: an underfunded goal moves to when its funded pace reaches it.
    sentence = t('budget.goalScreen.late', {
      date: words.monthYear(plan.projected),
      by: words.monthYear(goal.by),
    })
  else sentence = t('budget.goalScreen.onTrack', { date: words.monthYear(plan.projected) })
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span>{words.figure(Math.max(0, progress))}</span>
        {target !== null && (
          <span className="text-[0.8125rem] text-text-muted">
            {t('budget.goalScreen.ofTarget', {
              target: words.text(target),
              percent: words.share(Math.max(0, Math.min(1, progress / Math.max(1, target)))),
            })}
          </span>
        )}
      </div>
      {target !== null && <ProgressBar value={progress / Math.max(1, target)} color="sun" />}
      {sentence && <p className="text-[0.9375rem] text-text">{sentence}</p>}
    </Card>
  )
}

/** BUD-21 to BUD-23, BUD-46: what it needs each month, what it gets and what went in. */
function ThisMonth({
  budget,
  goal,
  plan,
  words,
}: {
  budget: Budget
  goal: Goal
  plan: GoalPlan
  words: BudgetWords
}) {
  const { t } = words
  const so = contributedThisMonth(budget, goal)
  return (
    <div className="flex flex-col gap-1.5">
      <List label={t('budget.goalScreen.month', { month: words.monthTitle(budget.month.period) })}>
        <ListRow title={t('budget.goalScreen.needs')} trailing={words.amount(plan.need)} />
        <ListRow
          title={t('budget.goalScreen.gets')}
          subtitle={t(`budget.goalScreen.funding.${plan.funding}`)}
          trailing={words.amount(plan.funded)}
        />
        <ListRow title={t('budget.goalScreen.soFar')} trailing={words.amount(so)} />
        {plan.funding !== 'funded' && plan.funding !== 'reached' && (
          <li className="group">
            <Link
              to="/budget/what-if"
              search={{ gap: true }}
              className="flex min-h-[3.25rem] w-full items-center gap-3 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
            >
              <span className="flex min-h-[3.25rem] min-w-0 flex-1 items-center gap-2 self-stretch border-t-[0.5px] border-separator py-2 pr-4">
                <span className="flex-1 text-[0.9375rem] text-brand">
                  {t('budget.goals.closeGap')}
                </span>
                <CaretRightIcon aria-hidden className="size-4 shrink-0 text-text-faint" />
              </span>
            </Link>
          </li>
        )}
      </List>
      <p className="px-4 text-[0.8125rem] text-text-muted">
        {goal.by
          ? t('budget.goalScreen.byHint', {
              count: monthsBetween(budget.month.period.start, goal.by, budget.settings.startDay),
            })
          : t('budget.goalScreen.orderHint')}
      </p>
    </div>
  )
}

/** BUD-28: when the debt is paid off, what it costs in interest, and what more would save. */
function Debt({ budget, goal, words }: { budget: Budget; goal: Goal; words: BudgetWords }) {
  const { t } = words
  const debt = debtPlan(budget, goal)
  if (!debt) return null
  const { now, faster } = debt
  return (
    <List label={t('budget.goalScreen.payoff')}>
      <ListRow
        title={t('budget.goalScreen.owed')}
        subtitle={debt.wallet.name}
        trailing={words.amount(debt.owed)}
      />
      {now ? (
        <ListRow
          title={t('budget.goalScreen.paidIn', { count: now.months })}
          // A wallet with no rate set charges no interest, so there's nothing to say.
          {...(now.interest > 0
            ? { subtitle: t('budget.goalScreen.interest', { amount: words.text(now.interest) }) }
            : {})}
          trailing={words.amount(debt.payment)}
        />
      ) : (
        <ListRow title={t('budget.goalScreen.tooLow')} trailing={words.amount(debt.payment)} />
      )}
      {now && faster && faster.months < now.months && (
        <ListRow
          title={t('budget.goalScreen.faster', {
            amount: words.text(debt.more),
            count: faster.months,
          })}
          {...(now.interest > faster.interest
            ? {
                subtitle: t('budget.goalScreen.saves', {
                  amount: words.text(now.interest - faster.interest),
                }),
              }
            : {})}
        />
      )}
    </List>
  )
}

/**
 * BUD-61 to BUD-64, BUD-66: what the purchase can cost, comfortable and maximum, with
 * how it adds up; other goals keep their dates because the payment comes from what is
 * left after them.
 */
function Afford({ budget, goal, words }: { budget: Budget; goal: Goal; words: BudgetWords }) {
  const { t } = words
  const result = affordFor(budget, goal)
  if (!result) return null
  const { plan, withCuts } = result
  const nothing = plan.payment.maximum <= 0
  const column = (label: string, level: 'comfortable' | 'maximum') => (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd>{words.figure(result.financed ? plan.price[level] : plan.downPayment)}</dd>
      {!nothing && (
        <dd className="text-[0.8125rem] text-text-muted">
          {t('budget.afford.perMonth', { amount: words.text(Math.max(0, plan.payment[level])) })}
        </dd>
      )}
    </div>
  )
  return (
    <>
      <Card className="flex flex-col gap-3">
        <h2 className="text-[0.9375rem] font-semibold text-text">
          {result.financed ? t('budget.afford.price') : t('budget.afford.downPayment')}
        </h2>
        <dl className="grid grid-cols-2 gap-3">
          {column(t('budget.afford.comfortable'), 'comfortable')}
          {column(t('budget.afford.maximum'), 'maximum')}
        </dl>
        <p className="text-[0.8125rem] text-text-muted">
          {nothing ? t('budget.afford.nothing') : t('budget.afford.levels')}
        </p>
      </Card>

      <List label={t('budget.afford.how')}>
        <ListRow title={t('budget.afford.savings')} trailing={words.amount(result.savings)} />
        <ListRow title={t('budget.afford.buffer')} trailing={words.amount(-result.buffer)} />
        {result.heldForGoals > 0 && (
          <ListRow title={t('budget.afford.held')} trailing={words.amount(-result.heldForGoals)} />
        )}
        <ListRow title={t('budget.afford.downPayment')} trailing={words.amount(plan.downPayment)} />
        <ListRow
          title={t('budget.afford.payment')}
          subtitle={t('budget.afford.paymentHint')}
          trailing={words.amount(Math.max(0, plan.payment.maximum))}
        />
      </List>

      {/* BUD-62, BUD-66: with the cuts a what-if would suggest, and the way there. */}
      <div className="flex flex-col gap-1.5">
        <List>
          {withCuts && (
            <ListRow
              title={t('budget.afford.withCuts', {
                amount: words.text(withCuts.payment.maximum),
              })}
              subtitle={
                result.financed
                  ? t('budget.afford.withCutsPrice', {
                      amount: words.text(withCuts.price.maximum),
                    })
                  : t('budget.afford.withCutsHint', { amount: words.text(result.cuts) })
              }
            />
          )}
          <li className="group">
            <Link
              to="/budget/what-if"
              className="flex min-h-[3.25rem] w-full items-center gap-3 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
            >
              <span className="flex min-h-[3.25rem] min-w-0 flex-1 items-center gap-2 self-stretch border-t-[0.5px] border-separator py-2 pr-4 group-first:border-t-0">
                <span className="flex-1 text-[0.9375rem] text-brand">
                  {t('budget.afford.tryWhatIf')}
                </span>
                <CaretRightIcon aria-hidden className="size-4 shrink-0 text-text-faint" />
              </span>
            </Link>
          </li>
        </List>
        <p className="px-4 text-[0.8125rem] text-text-muted">{t('budget.afford.goalsKeep')}</p>
      </div>
    </>
  )
}

/** BUD-26: whether the amount goes in or comes out of the goal. */
function InOrOut({ onChange }: { onChange: (out: boolean) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState<'in' | 'out'>('in')
  return (
    <SegmentedControl
      label={t('budget.goalScreen.direction')}
      options={[
        { value: 'in', label: t('budget.goalScreen.in') },
        { value: 'out', label: t('budget.goalScreen.out') },
      ]}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next === 'out')
      }}
    />
  )
}
