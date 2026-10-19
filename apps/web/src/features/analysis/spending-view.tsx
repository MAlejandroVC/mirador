import {
  breakdown,
  byWeekday,
  type CategoryChange,
  flexibilitySplit,
  improvements,
  inProgress,
  netWorthHistory,
  pace,
  periodTotals,
  projection,
  usualSpending,
  whatChanged,
} from '@repo/core'
import { HeroCard } from '../../components/ui/hero-card'
import { ListLinkRow } from '../../components/ui/list'
import { softColor, topParts } from './chart-colors'
import { PaceChart, StackedBar, Sparkline } from './charts'
import { changeSentence } from './sentences'
import { Card, QuestionTile, SectionLabel, SliceLink, Versus } from './parts'
import { useSliceLook } from './use-slice-look'
import { committedFor, lookbackRange, monthView, usualLeftOver } from './queries'
import type { Analysis } from './use-analysis'
import { flagThreshold, type Words } from './use-words'

// Epic 5, the Spending side of Budget: how the period is going against the usual one
// (ANA-01, ANA-12, ANA-21), where the money went (ANA-10, ANA-13), then a tile for
// each bigger question, which opens its screen; what changed most (ANA-26) leads them.
export function SpendingView({ analysis, words }: { analysis: Analysis; words: Words }) {
  const { t } = words
  const { entries, view, today } = analysis
  const look = useSliceLook(analysis)
  const going = inProgress(view)
  const usual = usualSpending(entries, view)
  const totals = periodTotals(entries, view.period)
  const curve = pace(entries, view)
  const groups = breakdown(entries, view.period, 'group')
  const flexibility = flexibilitySplit(entries, view.period)
  const flexibleTotal = flexibility.locked + flexibility.fixed + flexibility.flexible
  const periodName = words.period(view.period, view.scope)

  // DL-CMP-01: the hero says how the period compares with the usual one, in words.
  const difference = usual.usual === null ? null : usual.current - usual.usual
  const versus = words.versusUsual(usual.current, usual.usual)
  const heroContext =
    difference === null
      ? t('analysis.hero.noHistory')
      : versus?.text === t('analysis.usual.same') || difference === 0
        ? going
          ? t('analysis.hero.sameSoFar', { date: words.date(today) })
          : t('analysis.hero.same')
        : t(`analysis.hero.${difference < 0 ? 'less' : 'more'}${going ? 'SoFar' : ''}`, {
            amount: words.text(Math.abs(difference)),
            date: words.date(today),
          })

  return (
    <>
      <HeroCard
        label={
          going ? t('analysis.hero.spentSoFar') : t('analysis.hero.spentIn', { period: periodName })
        }
        amount={words.hero(usual.current)}
        context={heroContext}
      />

      {/* ANA-01: what came in, what is left and the share of income kept. */}
      <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-surface px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-text-muted">{t('analysis.totals.income')}</dt>
          <dd>{words.amount(totals.income, 'moss')}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-text-muted">{t('analysis.totals.leftOver')}</dt>
          <dd>{words.amount(totals.leftOver)}</dd>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <dt className="text-xs text-text-muted">{t('analysis.totals.savingsRate')}</dt>
          <dd className="text-[0.9375rem] text-text tabular-nums">
            {totals.savingsRate === null ? '–' : words.share(Math.max(0, totals.savingsRate))}
          </dd>
        </div>
      </dl>

      {/* ANA-21: the period so far against the usual one. */}
      {curve.usual.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-[0.9375rem] font-semibold text-text">{t('analysis.pace.title')}</h2>
          <PaceChart
            current={curve.current}
            usual={curve.usual}
            days={curve.days}
            label={t('analysis.pace.label', {
              spent: words.text(usual.current),
              usual: words.text(usual.usual ?? 0),
            })}
          />
          <div aria-hidden className="flex gap-4 text-[0.75rem] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-[3px] w-4 rounded-full bg-brand" />
              {periodName}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t-[1.5px] border-dashed border-text-faint" />
              {t('analysis.pace.usual')}
            </span>
          </div>
        </Card>
      )}

      {/* ANA-10: by category group, with each one against its usual period. */}
      {groups.length > 0 && (
        <>
          <SectionLabel>{t('analysis.where.title')}</SectionLabel>
          <Card className="flex flex-col gap-1 px-0 pt-4 pb-0">
            <div className="px-4 pb-2">
              <StackedBar
                parts={topParts(
                  groups.map((group) => ({
                    key: group.key,
                    value: group.spent,
                    color: look('group', group.key).color,
                  })),
                )}
              />
            </div>
            <ul>
              {groups.slice(0, 4).map((group) => {
                const groupLook = look('group', group.key)
                const groupUsual = usualSpending(
                  entries,
                  view,
                  (entry) => entry.groupId === group.key,
                )
                return (
                  <SliceLink
                    key={group.key}
                    by="group"
                    id={group.key}
                    leading={groupLook.leading}
                    title={groupLook.name}
                    subtitle={
                      <>
                        {words.share(group.share)}
                        {groupUsual.usual !== null && (
                          <>
                            {' · '}
                            <Versus
                              versus={words.versusUsual(groupUsual.current, groupUsual.usual)}
                            />
                          </>
                        )}
                      </>
                    }
                    trailing={words.amount(group.spent)}
                  />
                )
              })}
              <ListLinkRow to="/budget/where" title={t('analysis.where.all')} tone="brand" />
            </ul>
          </Card>
        </>
      )}

      {/* ANA-13: what could change and what can't, and the way to change which is which. */}
      {flexibleTotal > 0 && (
        <Card className="flex flex-col gap-3 px-0 pt-4 pb-0">
          <h2 className="px-4 text-[0.9375rem] font-semibold text-text">
            {t('analysis.flexibility.title')}
          </h2>
          <div className="px-4">
            <StackedBar
              parts={[
                { key: 'locked', value: flexibility.locked, color: 'brand', strength: 1 },
                { key: 'fixed', value: flexibility.fixed, color: 'brand', strength: 0.6 },
                { key: 'flexible', value: flexibility.flexible, color: 'brand', strength: 0.3 },
              ]}
            />
          </div>
          <dl className="grid grid-cols-3 gap-2 px-4">
            {(['locked', 'fixed', 'flexible'] as const).map((kind, index) => (
              <div key={kind} className="flex min-w-0 flex-col gap-0.5">
                <dt className="flex items-center gap-1.5 text-xs text-text-muted">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: softColor('brand', [1, 0.6, 0.3][index]) }}
                  />
                  {t(`categories.flexibility.${kind}Plural`)}
                </dt>
                <dd className="flex flex-col">
                  {words.amount(flexibility[kind])}
                  <span className="text-[0.8125rem] text-text-muted">
                    {words.share(flexibility[kind] / flexibleTotal)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <ul>
            <ListLinkRow
              to="/settings/needs-and-wants"
              title={t('analysis.flexibility.edit')}
              tone="brand"
            />
          </ul>
        </Card>
      )}

      <SectionLabel>{t('analysis.tiles.title')}</SectionLabel>
      <QuestionTiles analysis={analysis} words={words} />
    </>
  )
}

/** ANA-30: a rise past the threshold first; otherwise the largest change either way. */
function pickChange(changes: readonly CategoryChange[]) {
  return (
    changes.find((item) => item.flagged && item.difference > 0) ??
    changes.find((item) => item.usual > 0 || item.current > 0)
  )
}

/** The bigger questions, each a tile with its short answer (option C's grid). */
function QuestionTiles({ analysis, words }: { analysis: Analysis; words: Words }) {
  const { t } = words
  const { entries, view, today, ledger } = analysis
  const look = useSliceLook(analysis)
  const range = lookbackRange(view)

  // ANA-22: the costliest day of the week.
  const days = byWeekday(entries, range)
  const average = days.reduce((sum, value) => sum + value, 0) / 7
  const busiest = days.indexOf(Math.max(...days))
  // ANA-27: what next month already owes.
  const nextMonth = committedFor(analysis, 2)[1]
  // ANA-31: what one step in each of the top three could save.
  const cuts = improvements(entries, monthView(analysis), ledger.categories).slice(0, 3)
  const cut = cuts.reduce((sum, item) => sum + item.potential, 0)
  // ANA-16, ANA-40: net worth so far, and in a year at the usual pace.
  const history = netWorthHistory(ledger.wallets, ledger.transactions, analysis.context, today, 12)
  const now = history.at(-1)?.netWorth ?? 0
  const leftOver = usualLeftOver(analysis)
  const inAYear = leftOver === null ? null : projection(now, leftOver, 12).points.at(-1)
  // ANA-26, ANA-30, ANA-33: the biggest change against a usual period.
  const top = pickChange(whatChanged(entries, view, flagThreshold))
  const plural = words.weekdays('long')

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {/* The question that matters most spans two columns, so the five fill a 2 × 3 grid. */}
      <QuestionTile
        wide
        to="/budget/changes"
        question={t('analysis.changed.title')}
        answer={
          top ? (
            <span className="flex min-w-0 items-center gap-2.5">
              {look('category', top.categoryId).leading}
              <span className="truncate">{look('category', top.categoryId).name}</span>
            </span>
          ) : (
            '–'
          )
        }
        detail={top ? changeSentence(top, words) : t('analysis.tiles.notYet')}
      />
      <QuestionTile
        to="/budget/when"
        question={t('analysis.tiles.when.question')}
        answer={average > 0 ? t(`analysis.weekdaysPlural.${String(busiest)}`) : '–'}
        detail={
          average > 0
            ? t('analysis.tiles.when.detail', {
                times: new Intl.NumberFormat(words.locale, { maximumFractionDigits: 1 }).format(
                  (days[busiest] ?? 0) / average,
                ),
              })
            : t('analysis.tiles.notYet')
        }
        visual={
          average > 0 && (
            <span aria-hidden className="flex h-8 items-end gap-1">
              {days.map((value, day) => (
                <span
                  key={plural[day]}
                  className="flex-1 rounded-t-[3px]"
                  style={{
                    height: `${String(Math.max(8, (value / Math.max(1, ...days)) * 100))}%`,
                    backgroundColor: day === busiest ? 'var(--mirador-brand)' : softColor('brand'),
                  }}
                />
              ))}
            </span>
          )
        }
      />
      <QuestionTile
        to="/budget/coming"
        question={t('analysis.tiles.coming.question')}
        answer={words.figure(nextMonth?.total ?? 0)}
        detail={t('analysis.tiles.coming.detail', {
          month: nextMonth ? words.monthLong(nextMonth.period) : '',
        })}
      />
      <QuestionTile
        to="/budget/cut"
        question={t('analysis.tiles.cut.question')}
        answer={cuts.length > 0 ? words.figure(cut) : '–'}
        detail={
          cuts.length > 0
            ? t('analysis.tiles.cut.detail', { count: cuts.length })
            : t('analysis.tiles.notYet')
        }
      />
      <QuestionTile
        to="/budget/trends"
        question={t('analysis.tiles.trends.question')}
        answer={words.figure(inAYear ?? now)}
        detail={
          inAYear == null ? t('analysis.tiles.trends.now') : t('analysis.tiles.trends.detail')
        }
        visual={<Sparkline values={history.map((point) => point.netWorth)} />}
      />
    </div>
  )
}
