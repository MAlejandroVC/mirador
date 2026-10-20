import { categoryRecord, categoryRecordType } from '@repo/api'
import {
  type AnalysisEntry,
  budgeted,
  elapsedDays,
  type Flexibility,
  type LineBaseline,
  lineOf,
  type PlanLine,
  parseLineKey,
  periodDays,
  usualShare,
} from '@repo/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { CaretRightIcon } from '../../components/ui/icons'
import { List, ListButtonRow, ListRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { Sheet } from '../../components/ui/sheet'
import { ColumnChart } from '../analysis/charts'
import { Card, SectionLabel } from '../analysis/parts'
import { CategoryTile, TagDot } from '../categories/category-tile'
import { recordBody, useSaveRecords } from '../wallets/use-ledger'
import { AmountSheet, type AmountRequest } from './amount-sheet'
import { type BudgetWords, useBudgetWords } from './budget-words'
import { LeaveOutSheet } from './leave-out-sheet'
import { commitmentStatus, lineLook, lineName } from './lines'
import { Over, ProgressBar } from './parts'
import { currentPlan, monthChange, planChange } from './records'
import { type Budget, monthOf, periodOf, placeOf, planFor, useBudget } from './use-budget'

const types: readonly Flexibility[] = ['flexible', 'fixed', 'locked']

// BUD-04, BUD-07, BUD-08, BUD-03, BUD-41: one line of a month's budget: the month against
// its target, the target itself, its type, its last months with the numbers behind its
// starting amount, and the ways to shape it: leave a month or a purchase out, or give
// one of its tags a target of its own. It shows this month unless opened from another.
export function LineScreen({ line, month }: { line: string; month?: string }) {
  const budget = useBudget()
  const back = useBack()
  const { t } = useTranslation()
  if (!budget) return <Page title="" back={back} />
  const look = lineLook(budget, line)
  if (!look.category) return <Page title={t('analysis.unknown')} back={back} />
  return <Line budget={budget} line={line} start={month} back={back} />
}

function Line({
  budget,
  line: key,
  start,
  back,
}: {
  budget: Budget
  line: string
  start: string | undefined
  back: ReturnType<typeof useBack>
}) {
  const words = useBudgetWords(budget.context.currency, budget.today)
  const { t } = words
  const navigate = useNavigate()
  const save = useSaveRecords()
  const [request, setRequest] = useState<AmountRequest | null>(null)
  const [typing, setTyping] = useState(false)
  const [leavingOut, setLeavingOut] = useState(false)
  const [tagging, setTagging] = useState(false)
  const { ledger } = budget
  const period = start ? periodOf(budget, start) : budget.month.period
  const month = planFor(budget, period, { all: true })
  const standing = monthOf(budget, period.start)
  const place = placeOf(budget, period.start)
  // BUD-72: the budget of this month or one ahead can change; a past one stays as it was.
  const editable = place !== 'past'
  const { category, group, tag, color } = lineLook(budget, key)
  const { categoryId, tagId } = parseLineKey(key)
  const usual = budget.usual.lines.find((item) => item.key === key) ?? null
  const planned: PlanLine = month.lines.find((item) => item.key === key) ?? {
    key,
    categoryId,
    tagId,
    flexibility: category?.flexibility ?? 'flexible',
    groupId: category?.groupId ?? '',
    base: 0,
    target: 0,
    starting: 0,
    carry: 0,
    spent: 0,
    left: 0,
    projected: 0,
    status: 'onTrack',
    lastDate: null,
    usual,
  }
  if (!category) return null
  const name = lineName(budget, key)
  const flexibility = category.flexibility
  const monthName = words.monthName(month.period)
  const plan = currentPlan(ledger)

  // BUD-42: what is usually spent by today along this line's own curve.
  const select = (entry: AnalysisEntry) => !entry.excluded && lineOf(entry, plan.tagLines) === key
  const usualSoFar = usual
    ? Math.round(
        usual.baseline *
          usualShare(
            budget.entries,
            budget.usual.counted,
            elapsedDays(month.period, budget.today),
            periodDays(month.period),
            select,
          ),
      )
    : null

  // BUD-04, BUD-70: the month's budget with this line's target changed; a month without
  // a record of its own gets one with every target it shows.
  const setTarget = (amount: number, done: () => void) => {
    const targets = new Map(month.lines.map((line) => [line.key, line.base] as const))
    targets.set(key, amount)
    save.mutate([monthChange(ledger, period.start, targets, month.income)], { onSuccess: done })
  }

  const editTarget = () => {
    setRequest({
      title: t('budget.line.targetTitle', { month: monthName }),
      intro: usual
        ? t('budget.line.targetIntro', { amount: words.text(usual.baseline) })
        : t('budget.line.targetIntroNone'),
      label: t('budget.line.target'),
      initial: planned.base,
      allowZero: true,
      ...(usual && planned.base !== planned.starting
        ? {
            secondary: (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setTarget(planned.starting, () => {
                    setRequest(null)
                  })
                }}
              >
                {t('budget.line.useStarting', { amount: words.text(planned.starting) })}
              </Button>
            ),
          }
        : {}),
      onSave: setTarget,
    })
  }

  const setType = (next: Flexibility) => {
    const { id, ...fields } = category
    save.mutate([
      {
        id,
        body: recordBody(
          categoryRecordType,
          categoryRecord.parse({ ...fields, flexibility: next }),
        ),
      },
    ])
    setTyping(false)
  }

  const removeTagLine = () => {
    save.mutate(
      [
        planChange(ledger, {
          tagLines: plan.tagLines.filter(
            (item) => !(item.categoryId === categoryId && item.tagId === tagId),
          ),
        }),
      ],
      {
        onSuccess: () => {
          back?.onClick()
        },
      },
    )
  }

  const description = tag
    ? t('budget.line.tagKind', {
        type: t(`categories.flexibility.${flexibility}`),
        category: category.name,
      })
    : t('budget.line.kind', {
        type: t(`categories.flexibility.${flexibility}`),
        group: group?.name ?? '',
      })

  return (
    <Page
      title={name}
      back={back}
      card={{
        icon: <CategoryTile category={category} group={group} size="large" />,
        description,
      }}
    >
      {/* BUD-41 to BUD-43: this month against the target. */}
      <Card className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[0.9375rem] font-semibold text-text">
            {words.monthTitle(month.period)}
          </h2>
          <span className="text-[0.9375rem] tabular-nums">
            {flexibility === 'locked' ? (
              <span className="text-text-muted">
                {commitmentStatus(budget, planned, words).text}
              </span>
            ) : planned.left < 0 ? (
              <Over>{t('budget.lines.over', { amount: words.text(-planned.left) })}</Over>
            ) : (
              <span className="text-text-muted">
                {t('budget.lines.left', { amount: words.text(planned.left) })}
              </span>
            )}
          </span>
        </div>
        {flexibility !== 'locked' && (
          <ProgressBar
            value={planned.target > 0 ? planned.spent / planned.target : planned.spent > 0 ? 1 : 0}
            color={color}
          />
        )}
        <p className="text-[0.8125rem] text-text-muted">
          {t('budget.line.spentOf', {
            spent: words.text(planned.spent),
            target: words.text(planned.target),
          })}
          {usualSoFar !== null &&
            flexibility !== 'locked' &&
            place === 'current' &&
            ` ${t('budget.line.usualSoFar', { date: words.day(budget.today), amount: words.text(usualSoFar) })}`}
        </p>
        {planned.status === 'atRisk' && (
          <p className="text-[0.8125rem]">
            <Over>
              {t('budget.lines.atRisk', {
                amount: words.text(planned.projected - planned.target),
                date: words.day(month.period.end),
              })}
            </Over>
          </p>
        )}
      </Card>

      {/* BUD-04, BUD-10: the target and the type. */}
      <div className="flex flex-col gap-1.5">
        <List label={t('budget.line.target')}>
          {editable ? (
            <ListButtonRow
              tone="text"
              title={t('budget.line.inMonth', { month: words.monthTitle(period) })}
              {...(usual && planned.base !== planned.starting
                ? { subtitle: t('budget.make.usual', { amount: words.text(planned.starting) }) }
                : {})}
              trailing={
                <span className="flex items-center gap-2">
                  {words.amount(planned.base)}
                  <CaretRightIcon aria-hidden className="size-4 text-text-faint" />
                </span>
              }
              onClick={editTarget}
            />
          ) : (
            <ListRow
              title={t('budget.line.inMonth', { month: words.monthTitle(period) })}
              trailing={words.amount(planned.base)}
            />
          )}
          {!tag && (
            <ListButtonRow
              tone="text"
              title={t('budget.line.type')}
              trailing={
                <span className="flex items-center gap-2 text-[0.9375rem] text-text-muted">
                  {t(`categories.flexibility.${flexibility}`)}
                  <CaretRightIcon aria-hidden className="size-4 text-text-faint" />
                </span>
              }
              onClick={() => {
                setTyping(true)
              }}
            />
          )}
        </List>
        <p className="px-4 text-[0.8125rem] text-text-muted">
          {/* BUD-73: a month that began without being locked in says what it carries on. */}
          {standing.state === 'carried'
            ? standing.from
              ? t('budget.track.carriedFrom', {
                  month: words.monthName(periodOf(budget, standing.from)),
                })
              : t('budget.track.carried')
            : budgeted(standing)
              ? t('budget.line.lockedHint', { month: monthName })
              : t('budget.line.draftHint', { month: monthName })}
          {planned.carry !== 0 &&
            ` ${t('budget.line.carried', { amount: words.text(planned.carry) })}`}
        </p>
      </div>

      {/* BUD-07: the months behind the usual month. */}
      {usual && usual.months.length > 0 && (
        <History
          usual={usual}
          oneOffs={budget.usual.oneOffs.filter((item) => item.line === key && !item.counted).length}
          words={words}
          color={color}
        />
      )}

      <div className="flex flex-col gap-1.5">
        <List>
          <ListButtonRow
            title={t('budget.line.leaveOut')}
            onClick={() => {
              setLeavingOut(true)
            }}
          />
          {!tag && ledger.tags.length > 0 && (
            <ListButtonRow
              title={t('budget.line.tagTarget')}
              onClick={() => {
                setTagging(true)
              }}
            />
          )}
          <li className="group">
            <Link
              to="/transactions"
              search={{
                date: month.period.start,
                scope: 'month',
                category: categoryId,
                ...(tagId ? { tag: tagId } : {}),
              }}
              className="flex min-h-[3.25rem] w-full items-center gap-3 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
            >
              <span className="flex min-h-[3.25rem] min-w-0 flex-1 items-center gap-2 self-stretch border-t-[0.5px] border-separator py-2 pr-4 group-first:border-t-0">
                <span className="flex-1 text-[0.9375rem] text-brand">
                  {t('budget.line.transactions', { month: monthName })}
                </span>
                <CaretRightIcon aria-hidden className="size-4 shrink-0 text-text-faint" />
              </span>
            </Link>
          </li>
        </List>
        {!tag && ledger.tags.length > 0 && (
          <p className="px-4 text-[0.8125rem] text-text-muted">{t('budget.line.tagHint')}</p>
        )}
      </div>

      {tag && (
        <Button variant="secondary" onClick={removeTagLine}>
          {t('budget.line.removeTag', { tag: tag.name })}
        </Button>
      )}

      <AmountSheet
        request={request}
        currency={budget.context.currency}
        pending={save.isPending}
        failed={save.isError}
        onClose={() => {
          setRequest(null)
        }}
      />

      {/* BUD-10: the type, with what each one means. */}
      <Sheet
        open={typing}
        title={t('budget.line.type')}
        doneLabel={t('nav.done')}
        onClose={() => {
          setTyping(false)
        }}
      >
        <List inset>
          {types.map((type) => (
            <ChoiceRow
              key={type}
              role="radio"
              title={t(`categories.flexibility.${type}`)}
              subtitle={t(`categories.flexibility.${type}Hint`)}
              checked={flexibility === type}
              onToggle={() => {
                setType(type)
              }}
            />
          ))}
        </List>
      </Sheet>

      <LeaveOutSheet
        open={leavingOut}
        budget={budget}
        line={key}
        onClose={() => {
          setLeavingOut(false)
        }}
      />

      {/* BUD-08: one of its tags gets a line and a target of its own. */}
      <Sheet
        open={tagging}
        title={t('budget.line.tagTarget')}
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          setTagging(false)
        }}
      >
        {tagging && (
          <>
            <p className="px-2 text-center text-[0.9375rem] text-text-muted">
              {t('budget.line.tagIntro', { category: category.name })}
            </p>
            <List inset>
              {ledger.tags
                .filter((item) => !item.archived)
                .map((item) => {
                  const has = plan.tagLines.some(
                    (line) => line.categoryId === categoryId && line.tagId === item.id,
                  )
                  return (
                    <ChoiceRow
                      key={item.id}
                      role="radio"
                      leading={
                        <span className="grid size-[2.125rem] shrink-0 place-items-center">
                          <TagDot color={item.color} />
                        </span>
                      }
                      title={item.name}
                      {...(has ? { subtitle: t('budget.line.tagHas') } : {})}
                      checked={has}
                      onToggle={() => {
                        const next = `${categoryId}~${item.id}`
                        if (has) {
                          setTagging(false)
                          void navigate({ to: '/budget/line/$line', params: { line: next } })
                          return
                        }
                        save.mutate(
                          [
                            planChange(ledger, {
                              tagLines: [...plan.tagLines, { categoryId, tagId: item.id }],
                            }),
                          ],
                          {
                            onSuccess: () => {
                              setTagging(false)
                              void navigate({ to: '/budget/line/$line', params: { line: next } })
                            },
                          },
                        )
                      }}
                    />
                  )
                })}
            </List>
          </>
        )}
      </Sheet>
    </Page>
  )
}

/** BUD-07: the last months as columns, left-out ones faint, and the numbers behind them. */
function History({
  usual,
  oneOffs,
  words,
  color,
}: {
  usual: LineBaseline
  /** BUD-02: how many of its purchases are one-offs left out. */
  oneOffs: number
  words: BudgetWords
  color: ReturnType<typeof lineLook>['color']
}) {
  const { t } = words
  const first = usual.months[0]
  const last = usual.months.at(-1)
  const excluded = usual.months.filter((item) => item.excluded)
  const trend =
    usual.trend === null
      ? '–'
      : Math.abs(usual.trend) < 0.05
        ? t('budget.line.steady')
        : t(usual.trend > 0 ? 'budget.line.up' : 'budget.line.down', {
            percent: words.share(Math.abs(usual.trend)),
          })
  const stats = [
    { label: t('budget.line.usual'), value: words.text(usual.baseline) },
    {
      label: t('budget.line.lowest'),
      value: usual.provenPeriod
        ? `${words.text(usual.proven)} · ${words.monthShort(usual.provenPeriod)}`
        : '–',
    },
    {
      label: t('budget.line.highest'),
      value: usual.highestPeriod
        ? `${words.text(usual.highest)} · ${words.monthShort(usual.highestPeriod)}`
        : '–',
    },
    { label: t('budget.line.lately'), value: trend },
    { label: t('budget.line.share'), value: words.share(usual.share) },
    {
      label: t('budget.line.ticket'),
      value: usual.averageTicket > 0 ? words.text(usual.averageTicket) : '–',
    },
  ]
  return (
    <>
      <SectionLabel
        {...(first && last
          ? { detail: `${words.monthShort(first.period)} – ${words.monthShort(last.period)}` }
          : {})}
      >
        {t('budget.line.lastMonths', { count: usual.months.length })}
      </SectionLabel>
      <Card className="flex flex-col gap-3">
        <ColumnChart
          color={color}
          average={usual.baseline}
          columns={usual.months.map((item) => ({
            key: item.period.start,
            label: words.monthShort(item.period),
            value: Math.max(0, item.spent),
            description: item.excluded
              ? t('budget.line.monthLeftOut', {
                  month: words.monthTitle(item.period),
                  amount: words.text(item.spent),
                })
              : t('analysis.trends.monthValue', {
                  month: words.monthTitle(item.period),
                  amount: words.text(item.spent),
                }),
            muted: item.excluded,
          }))}
        />
        <p className="text-[0.8125rem] text-text-muted">
          {t('budget.line.average')}
          {oneOffs > 0 && ` ${t('budget.line.oneOffs', { count: oneOffs })}`}
          {excluded.length > 0 &&
            ` ${t('budget.line.leftOut', {
              months: excluded
                .map((item, index) =>
                  index === 0 ? words.monthTitle(item.period) : words.monthName(item.period),
                )
                .join(', '),
              count: excluded.length,
            })}`}
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t-[0.5px] border-separator pt-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex min-w-0 flex-col">
              <dt className="text-xs text-text-muted">{stat.label}</dt>
              <dd className="truncate text-[0.9375rem] text-text tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  )
}
