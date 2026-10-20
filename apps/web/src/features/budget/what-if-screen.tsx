import { type ScenarioRecord, scenarioRecordType } from '@repo/api'
import { type Category, emptyScenario, goalOffers, lineKey, type Scenario } from '@repo/core'
import { useNavigate } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { IconTile } from '../../components/ui/icon-tile'
import { CheckCircleIcon, FlaskIcon, PlusIcon, TrendUpIcon } from '../../components/ui/icons'
import { List, ListButtonRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { rowClass } from '../../components/ui/row'
import { useUndo } from '../../components/ui/use-undo'
import { useMoney } from '../../lib/format'
import { CategoryPicker } from '../categories/category-picker'
import { CategoryTile } from '../categories/category-tile'
import { newId, type RecordChange, useSaveRecords } from '../wallets/use-ledger'
import { type BudgetWords, useBudgetWords } from './budget-words'
import { lineLook, lineName } from './lines'
import { GoalTile } from './parts'
import { deletion, scenarioChange } from './records'
import {
  activation,
  changesAnything,
  recordOf,
  sameScenario,
  scenarioOf,
  startChoices,
  suggestedCuts,
  targetBefore,
  type Tried,
  tryScenario,
  withChange,
  withGoalChange,
} from './scenario-math'
import { type Budget, useBudget } from './use-budget'
import {
  AddChangeSheet,
  GoalChangeSheet,
  IncomeSheet,
  LineChangeSheet,
  NameSheet,
  UseSheet,
} from './what-if-sheets'
import { changeNote, goalEffect } from './what-if-words'

// Epic 6, what-ifs (BUD-30 to BUD-39): changes tried on top of the plan without
// touching it. Every change recomputes the left over and each goal at once (BUD-32);
// the what-if lives on this screen until it is saved for later (BUD-38) or used as the
// plan from this month or the next (BUD-39).

/** BUD-37: a cut phased in reaches its full size over this many months. */
const phaseSteps = 3

type SheetKind =
  | { kind: 'add' }
  | { kind: 'line'; key: string }
  | { kind: 'income' }
  | { kind: 'goal'; goalId: string }
  | { kind: 'name'; rename: boolean }
  | { kind: 'use' }

export function WhatIfScreen({ gap, id }: { gap?: boolean; id?: string }) {
  const budget = useBudget()
  const back = useBack()
  const { t } = useTranslation()
  // Another what-if opened on this screen starts from its own changes; the one this
  // screen just saved for later stays as it is, sheet and all.
  const [own, setOwn] = useState<string | null>(null)
  const [view, setView] = useState({ id, gap, key: 0 })
  if (view.id !== id || view.gap !== gap)
    setView({ id, gap, key: id !== undefined && id === own ? view.key : view.key + 1 })
  if (!budget) return <Page title="" back={back} />
  const record = id ? budget.ledger.scenarios.find((item) => item.id === id) : undefined
  if (id && !record) return <Page title={t('budget.whatIf.gone')} back={back} />
  return (
    <WhatIfPage
      key={view.key}
      budget={budget}
      record={record}
      gap={gap === true}
      back={back}
      onSaved={setOwn}
    />
  )
}

/** BUD-35: a what-if opened to close the gap starts with the suggested cuts. */
function start(budget: Budget, record: ScenarioRecord | undefined, gap: boolean) {
  if (record) return { scenario: scenarioOf(record), suggested: new Set<string>() }
  if (!gap) return { scenario: emptyScenario, suggested: new Set<string>() }
  const cuts = suggestedCuts(budget, emptyScenario)
  return {
    scenario: cuts.reduce(withChange, emptyScenario),
    suggested: new Set(cuts.map((cut) => cut.line)),
  }
}

function WhatIfPage({
  budget,
  record,
  gap,
  back,
  onSaved,
}: {
  budget: Budget
  record: (ScenarioRecord & { id: string }) | undefined
  gap: boolean
  back: ReturnType<typeof useBack>
  /** The id the what-if on screen was saved under, as it becomes that saved one. */
  onSaved: (id: string) => void
}) {
  const words = useBudgetWords(budget.context.currency, budget.today)
  const { t } = words
  const save = useSaveRecords()
  const undo = useUndo()
  const navigate = useNavigate()
  const [initial] = useState(() => start(budget, record, gap))
  const [scenario, setScenario] = useState<Scenario>(initial.scenario)
  const [suggested, setSuggested] = useState<ReadonlySet<string>>(initial.suggested)
  const [sheet, setSheet] = useState<(SheetKind & { seq: number }) | null>(null)
  const [seq, setSeq] = useState(0)
  const [picking, setPicking] = useState(false)

  const open = (next: SheetKind) => {
    setSeq(seq + 1)
    setSheet({ ...next, seq: seq + 1 })
  }
  const close = () => {
    setSheet(null)
  }

  // BUD-32: everything recomputed from the what-if on every render.
  const tried = tryScenario(budget, scenario)
  const gapLeft = tried.funding.gap
  const more = gapLeft > 0 ? suggestedCuts(budget, scenario) : []
  const moreFreed = more.reduce(
    (sum, change) => sum + targetBefore(budget, change.line) - change.value,
    0,
  )
  // BUD-36: what the cuts can't cover, and the goals that could ask for less.
  const short = Math.max(0, gapLeft - moreFreed)
  const offers =
    short > 0 ? goalOffers(tried.funding, budget.month.period, budget.settings.startDay) : []
  const changed = changesAnything(scenario)
  // BUD-11: a category treated as another kind stays in the what-if, so on its own it
  // gives the plan nothing to follow.
  const usable =
    scenario.changes.length > 0 || (scenario.income ?? 0) !== 0 || scenario.goals.length > 0
  const dirty = record ? !sameScenario(scenario, scenarioOf(record)) : changed
  const months = startChoices(budget)
  const inUse = record !== undefined && budget.ledger.plan?.scenarioId === record.id

  const closeGap = () => {
    setScenario(more.reduce(withChange, scenario))
    setSuggested(new Set([...suggested, ...more.map((change) => change.line)]))
  }

  // BUD-38: saved under a name, then opened as the saved what-if it now is.
  const saveNew = (name: string, done: () => void) => {
    const id = newId()
    save.mutate([scenarioChange(id, recordOf(scenario, name))], {
      onSuccess: () => {
        done()
        onSaved(id)
        void navigate({ to: '/budget/what-if', search: { id }, replace: true })
      },
    })
  }

  const rename = (name: string, done: () => void) => {
    if (!record) return
    const { id, ...data } = record
    save.mutate([scenarioChange(id, { ...data, name })], { onSuccess: done })
  }

  const saveChanges = () => {
    if (!record) return
    save.mutate([scenarioChange(record.id, recordOf(scenario, record.name, record.createdAt))])
  }

  const duplicate = () => {
    if (!record) return
    const id = newId()
    const name = t('budget.whatIf.copyName', { name: record.name }).slice(0, 80)
    save.mutate([scenarioChange(id, recordOf(scenario, name))], {
      onSuccess: () => {
        void navigate({ to: '/budget/what-if', search: { id } })
      },
    })
  }

  // DL-PAT-06: one what-if goes at once, with a way back.
  const remove = () => {
    if (!record) return
    const { id, ...data } = record
    save.mutate([deletion(id, scenarioRecordType)], {
      onSuccess: () => {
        if (back) back.onClick()
        else void navigate({ to: '/budget/what-ifs', replace: true })
        undo({
          message: t('budget.whatIf.deleted', { name: record.name }),
          undo: () => {
            save.mutate([scenarioChange(id, data)])
          },
        })
      },
    })
  }

  // BUD-39: the plan follows the what-if from the month chosen.
  const use = (from: string, done: () => void) => {
    const changes: RecordChange[] = activation(budget, scenario, from, record?.id)
    save.mutate(changes, {
      onSuccess: () => {
        done()
        if (back) back.onClick()
        else void navigate({ to: '/budget' })
      },
    })
  }

  return (
    <Page
      title={record?.name ?? t('budget.whatIf.title')}
      back={back}
      card={{
        icon: <IconTile icon={FlaskIcon} size="large" />,
        description: t('budget.whatIf.description'),
      }}
    >
      <LeftOver
        budget={budget}
        tried={tried}
        changed={changed}
        moreFreed={moreFreed}
        short={short}
        words={words}
      />

      {/* BUD-36: the cuts can't close it, so a goal could ask for less. */}
      {offers.length > 0 && (
        <List label={t('budget.whatIf.offersLabel')}>
          {offers.map((offer) => {
            const goal = tried.goals.find((item) => item.id === offer.change.goalId)
            if (!goal) return null
            const existing = scenario.goals.find((item) => item.goalId === goal.id)
            return (
              <ListButtonRow
                key={`${goal.id}:${offer.kind}`}
                leading={<GoalTile kind={goal.kind} />}
                title={
                  offer.change.by
                    ? t('budget.whatIf.offers.later', {
                        name: goal.name,
                        date: words.monthYear(offer.change.by),
                      })
                    : offer.change.perMonth !== undefined
                      ? t('budget.whatIf.offers.monthly', {
                          name: goal.name,
                          amount: words.text(offer.change.perMonth),
                        })
                      : t('budget.whatIf.offers.lower', {
                          name: goal.name,
                          amount: words.text(offer.change.target ?? 0),
                        })
                }
                onClick={() => {
                  setScenario(withGoalChange(scenario, goal.id, { ...existing, ...offer.change }))
                }}
              />
            )
          })}
        </List>
      )}

      <List
        label={t('budget.whatIf.changes')}
        {...(scenario.changes.some((change) => suggested.has(change.line))
          ? { detail: t('budget.whatIf.suggested') }
          : {})}
      >
        {!changed && (
          <li className="px-4 py-3.5 text-[0.9375rem] text-text-muted">
            {t('budget.whatIf.none')}
          </li>
        )}
        {changedLines(budget, scenario).map((key) => (
          <ChangeRow
            key={key}
            budget={budget}
            scenario={scenario}
            tried={tried}
            lineKey={key}
            words={words}
            onOpen={() => {
              open({ kind: 'line', key })
            }}
          />
        ))}
        {(scenario.income ?? 0) !== 0 && (
          <IncomeRow
            raise={scenario.income ?? 0}
            income={tried.income}
            currency={budget.context.currency}
            words={words}
            onOpen={() => {
              open({ kind: 'income' })
            }}
          />
        )}
        {more.length > 0 && (
          <ListButtonRow
            leading={<span className="w-[2.125rem]" />}
            title={t('budget.whatIf.closeGap')}
            subtitle={t('budget.whatIf.closeGapHint', { amount: words.text(moreFreed) })}
            onClick={closeGap}
          />
        )}
        <ListButtonRow
          leading={
            <span className="grid size-[2.125rem] place-items-center text-brand">
              <PlusIcon aria-hidden className="size-5" />
            </span>
          }
          title={t('budget.whatIf.add')}
          onClick={() => {
            open({ kind: 'add' })
          }}
        />
      </List>
      {/* BUD-35: how the cuts are picked, once there are cuts to pick. */}
      {(gapLeft > 0 || suggested.size > 0) && (
        <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">
          {t('budget.whatIf.rule', { percent: words.share(budget.settings.maxCut) })}
        </p>
      )}

      {tried.funding.goals.length > 0 && (
        <List label={t('budget.whatIf.goals')}>
          {tried.funding.goals.map((plan) => {
            const before = budget.funding.goals.find((item) => item.goal.id === plan.goal.id)
            const changedHere = scenario.goals.some((item) => item.goalId === plan.goal.id)
            return (
              <ListButtonRow
                key={plan.goal.id}
                tone="text"
                leading={<GoalTile kind={plan.goal.kind} />}
                title={plan.goal.name}
                subtitle={[
                  goalEffect(words, before, plan),
                  changedHere ? t('budget.whatIf.goal.changed') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onClick={() => {
                  open({ kind: 'goal', goalId: plan.goal.id })
                }}
              />
            )
          })}
        </List>
      )}

      {/* BUD-37: cuts at once, or a step a month until they are whole. */}
      {tried.cut > 0 && (
        <List>
          <ChoiceRow
            role="switch"
            title={t('budget.whatIf.phase', { count: phaseSteps })}
            subtitle={t('budget.whatIf.phaseHint')}
            checked={scenario.steps > 1}
            onToggle={() => {
              setScenario({ ...scenario, steps: scenario.steps > 1 ? 1 : phaseSteps })
            }}
          />
        </List>
      )}

      {inUse && <p className="px-4 text-[0.8125rem] text-text-muted">{t('budget.whatIf.inUse')}</p>}

      {(changed || record) && (
        <div className="flex flex-col gap-1">
          {/* DL-CMP-05: the screen's one filled button. */}
          {usable && (
            <Button
              onClick={() => {
                open({ kind: 'use' })
              }}
            >
              {t('budget.whatIf.use')}
            </Button>
          )}
          {!record && (
            <Button
              variant="ghost"
              onClick={() => {
                open({ kind: 'name', rename: false })
              }}
            >
              {t('budget.whatIf.saveForLater')}
            </Button>
          )}
          {record && dirty && (
            <Button variant="ghost" disabled={save.isPending} onClick={saveChanges}>
              {t('budget.whatIf.saveChanges')}
            </Button>
          )}
        </div>
      )}
      {save.isError && sheet === null && (
        <p role="alert" className="px-4 text-center text-[0.8125rem] text-warning">
          {t('budget.whatIf.saveFailed')}
        </p>
      )}

      {record && (
        <>
          <List>
            <ListButtonRow
              title={t('budget.whatIf.rename')}
              onClick={() => {
                open({ kind: 'name', rename: true })
              }}
            />
            <ListButtonRow title={t('budget.whatIf.duplicate')} onClick={duplicate} />
          </List>
          <Button variant="danger" onClick={remove}>
            {t('budget.whatIf.delete')}
          </Button>
        </>
      )}

      <AddChangeSheet
        open={sheet?.kind === 'add'}
        budget={budget}
        scenario={scenario}
        onLine={(key) => {
          open({ kind: 'line', key })
        }}
        onIncome={() => {
          open({ kind: 'income' })
        }}
        onGoal={(goalId) => {
          open({ kind: 'goal', goalId })
        }}
        onNewExpense={() => {
          close()
          setPicking(true)
        }}
        onClose={close}
      />
      <LineChangeSheet
        lineKey={sheet?.kind === 'line' ? sheet.key : null}
        seq={sheet?.seq ?? 0}
        budget={budget}
        scenario={scenario}
        onApply={setScenario}
        onClose={close}
      />
      <IncomeSheet
        open={sheet?.kind === 'income'}
        seq={sheet?.seq ?? 0}
        budget={budget}
        scenario={scenario}
        onApply={setScenario}
        onClose={close}
      />
      <GoalChangeSheet
        goalId={sheet?.kind === 'goal' ? sheet.goalId : null}
        seq={sheet?.seq ?? 0}
        budget={budget}
        scenario={scenario}
        onApply={setScenario}
        onClose={close}
      />
      <NameSheet
        open={sheet?.kind === 'name'}
        seq={sheet?.seq ?? 0}
        title={
          sheet?.kind === 'name' && sheet.rename
            ? t('budget.whatIf.nameSheet.rename')
            : t('budget.whatIf.nameSheet.title')
        }
        initial={record?.name ?? guessName(budget, scenario, words)}
        pending={save.isPending}
        failed={save.isError}
        onSave={sheet?.kind === 'name' && sheet.rename ? rename : saveNew}
        onClose={close}
      />
      <UseSheet
        open={sheet?.kind === 'use'}
        seq={sheet?.seq ?? 0}
        scenario={scenario}
        months={{
          now: months.now,
          next: months.next,
          nowName: words.monthName(months.now),
          nowTitle: words.monthTitle(months.now),
          nextName: words.monthName(months.next),
        }}
        pending={save.isPending}
        failed={save.isError}
        onUse={use}
        onClose={close}
      />
      {/* BUD-31: a new expense is a category with no target yet. */}
      <CategoryPicker
        open={picking}
        ledger={budget.ledger}
        type="expense"
        value={null}
        onChoose={(category: Category) => {
          setPicking(false)
          open({ kind: 'line', key: lineKey(category.id) })
        }}
        onClose={() => {
          setPicking(false)
        }}
      />
    </Page>
  )
}

/** BUD-32: the left over before and after, and what it means for the goals. */
function LeftOver({
  budget,
  tried,
  changed,
  moreFreed,
  short,
  words,
}: {
  budget: Budget
  tried: Tried
  changed: boolean
  moreFreed: number
  short: number
  words: BudgetWords
}) {
  const { t } = words
  const before = budget.month.leftOver
  const after = tried.leftOver
  const { funding } = tried
  let sentence: ReactNode
  if (after < 0)
    // DL-PAT-05: a gentle caution, in words.
    sentence = (
      <span className="text-warning">
        {t('budget.whatIf.overspent', { amount: words.text(-after) })}
      </span>
    )
  else if (funding.gap > 0)
    sentence = <span>{t('budget.whatIf.short', { amount: words.text(funding.gap) })}</span>
  else if (funding.need > 0)
    sentence = (
      <>
        {/* DL-COL-09: every goal funded is a good moment, in `sun`. */}
        <CheckCircleIcon aria-hidden className="mt-0.5 size-[1.125rem] shrink-0 text-sun" />
        <span>{t('budget.whatIf.allFunded', { amount: words.text(funding.free) })}</span>
      </>
    )
  else sentence = <span>{t('budget.whatIf.free')}</span>
  return (
    <section className="flex flex-col gap-1.5 rounded-2xl bg-surface px-4 py-3.5">
      <h2 className="text-[0.8125rem] text-text-muted">{t('budget.whatIf.leftOver')}</h2>
      <p className="flex flex-wrap items-baseline gap-2">
        {changed && after !== before && (
          <>
            <span
              aria-hidden
              className="text-[1.0625rem] text-text-muted tabular-nums line-through"
            >
              {words.text(before)}
            </span>
            <span className="sr-only">
              {t('budget.whatIf.was', { amount: words.text(before) })}
            </span>
          </>
        )}
        {words.figure(after)}
      </p>
      <p aria-live="polite" className="flex items-start gap-1.5 text-[0.9375rem] text-text">
        {sentence}
      </p>
      {/* BUD-36: by how much the cuts within the limits fall short. */}
      {short > 0 && (
        <p className="text-[0.8125rem] text-text-muted">
          {moreFreed > 0
            ? t('budget.whatIf.cantClose', {
                amount: words.text(moreFreed),
                short: words.text(short),
              })
            : t('budget.whatIf.cantCloseNone', { short: words.text(short) })}
        </p>
      )}
    </section>
  )
}

/**
 * The lines the what-if touches: those it changes, then those only unlocked (BUD-33)
 * or counted as another kind (BUD-11), so each shows and can be undone.
 */
function changedLines(budget: Budget, scenario: Scenario) {
  const kinds = new Set(scenario.flexibility.map((item) => item.categoryId))
  const keys = [
    ...scenario.changes.map((change) => change.line),
    ...scenario.unlocked,
    ...budget.month.lines.filter((line) => kinds.has(line.categoryId)).map((line) => line.key),
  ]
  return [...new Set(keys)]
}

/** A line change in the list: what it frees, why it is reachable and the habit. */
function ChangeRow({
  budget,
  scenario,
  tried,
  lineKey: key,
  words,
  onOpen,
}: {
  budget: Budget
  scenario: Scenario
  tried: Tried
  lineKey: string
  words: BudgetWords
  onOpen: () => void
}) {
  const { t } = words
  const before = targetBefore(budget, key)
  const after = tried.targets.get(key) ?? before
  const freed = before - after
  const look = lineLook(budget, key)
  return (
    <NoteRow
      leading={
        look.category ? <CategoryTile category={look.category} group={look.group} /> : undefined
      }
      title={lineName(budget, key)}
      value={
        freed === 0
          ? null
          : freed > 0
            ? t('budget.whatIf.perMonth', { amount: words.text(freed) })
            : t('budget.whatIf.morePerMonth', { amount: words.text(-freed) })
      }
      note={changeNote(budget, words, scenario, key, after)}
      onClick={onOpen}
    />
  )
}

/** BUD-31: more or less income; money in takes Moss with its sign (DL-COL-07). */
function IncomeRow({
  raise,
  income,
  currency,
  words,
  onOpen,
}: {
  raise: number
  income: number
  currency: string
  words: BudgetWords
  onOpen: () => void
}) {
  const { t } = words
  const money = useMoney(currency)
  return (
    <NoteRow
      leading={<IconTile icon={TrendUpIcon} />}
      title={t('budget.whatIf.income')}
      value={
        <span className={raise > 0 ? 'text-moss' : undefined}>
          {t('budget.whatIf.perMonth', {
            amount: money.text({ minor: raise, currency }, 'always'),
          })}
        </span>
      }
      note={t('budget.whatIf.incomeTo', { amount: words.text(income) })}
      onClick={onOpen}
    />
  )
}

/**
 * DL-CMP-07: a change in the list, as in the mockup: its name and what it frees a
 * month on the first line, and the sentence on why it is reachable across the row
 * below, so a long reason doesn't squeeze into a narrow column. It opens its sheet.
 */
function NoteRow({
  leading,
  title,
  value,
  note,
  onClick,
}: {
  leading: ReactNode
  title: string
  value: ReactNode
  note: string
  onClick: () => void
}) {
  return (
    <li className="group">
      <button type="button" onClick={onClick} className={rowClass}>
        {leading}
        {/* DL-SHP-04: the hairline starts where the text starts. */}
        <span className="flex min-h-[3.75rem] min-w-0 flex-1 flex-col justify-center gap-0.5 self-stretch border-t-[0.5px] border-separator py-2.5 pr-4 group-first:border-t-0">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[0.9375rem] text-text">{title}</span>
            {value && (
              <span className="shrink-0 text-[0.9375rem] text-text tabular-nums">{value}</span>
            )}
          </span>
          {note && <span className="text-[0.8125rem] text-text-muted">{note}</span>}
        </span>
      </button>
    </li>
  )
}

/** DL-PAT-02: a name guessed from the first change, to keep or type over. */
function guessName(budget: Budget, scenario: Scenario, words: BudgetWords) {
  const { t } = words
  const [first] = scenario.changes
  if (first) {
    const name = lineName(budget, first.line)
    const before = targetBefore(budget, first.line)
    if (before === 0) return t('budget.whatIf.names.add', { name })
    return (tryScenario(budget, scenario).targets.get(first.line) ?? before) < before
      ? t('budget.whatIf.names.less', { name })
      : t('budget.whatIf.names.more', { name })
  }
  if ((scenario.income ?? 0) > 0) return t('budget.whatIf.names.raise')
  if ((scenario.income ?? 0) < 0) return t('budget.whatIf.names.lessIncome')
  const goal = budget.goals.find((item) => item.id === scenario.goals[0]?.goalId)
  if (goal) return t('budget.whatIf.names.goal', { name: goal.name })
  return t('budget.whatIf.names.other')
}
