import {
  type AnalysisEntry,
  breakdown,
  byWeekday,
  compareSpending,
  cutSavings,
  inProgress,
  lookbackPeriods,
  type SliceBy,
  spendingSeries,
  splitChange,
  usualSpending,
} from '@repo/core'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { HeroCard } from '../../components/ui/hero-card'
import { Page } from '../../components/ui/page'
import { CategoryTile } from '../categories/category-tile'
import { ColumnChart } from './charts'
import { Card, FigureRow, SectionLabel, SliceLink, TransactionsLink } from './parts'
import { useSliceLook } from './use-slice-look'
import { PeriodHeader } from './period-header'
import { drillDown, lookbackRange } from './queries'
import { type Analysis, useAnalysis } from './use-analysis'
import { useWords, type Words } from './use-words'

const slices: readonly string[] = ['group', 'category', 'tag', 'payee', 'wallet']

/** Which entries belong to a slice. */
function selectFor(by: SliceBy, id: string) {
  switch (by) {
    case 'group':
      return (entry: AnalysisEntry) => entry.groupId === id
    case 'category':
      return (entry: AnalysisEntry) => entry.categoryId === id
    case 'tag':
      return (entry: AnalysisEntry) => entry.tagIds.includes(id)
    case 'payee':
      return (entry: AnalysisEntry) => entry.payeeId === id
    case 'wallet':
      return (entry: AnalysisEntry) => entry.walletId === id
  }
}

// ANA-10 to ANA-12, ANA-14, ANA-18, ANA-22, ANA-23, ANA-26, ANA-32: one category group,
// category, tag, payee or wallet: what it spent in the period against the previous one
// and the 3, 6 and 12-period averages, its last 12 periods, how many purchases and
// their average, when in the week, and, for a category, what a cut would save. A
// group lists its categories (drill-down), and every figure ends in its transactions
// (ANA-04).
export function SliceScreen({ by, id }: { by: string; id: string }) {
  const { t } = useTranslation()
  const analysis = useAnalysis()
  const back = useBack()
  if (!analysis) return <Page title="" back={back} />
  if (!slices.includes(by)) return <Page title={t('analysis.unknown')} back={back} />
  return <Slice analysis={analysis} by={by as SliceBy} id={id} back={back} />
}

function Slice({
  analysis,
  by,
  id,
  back,
}: {
  analysis: Analysis
  by: SliceBy
  id: string
  back: ReturnType<typeof useBack>
}) {
  const navigate = useNavigate()
  const words = useWords(analysis.context.currency, analysis.today)
  const { t } = words
  const look = useSliceLook(analysis)
  const { entries, view, lookups } = analysis
  const select = selectFor(by, id)
  const self = look(by, id)
  const category = by === 'category' ? lookups.categories.get(id) : undefined
  const group = category ? lookups.groupOf(category) : undefined
  const going = inProgress(view)

  const usual = usualSpending(entries, view, select)
  const compared = compareSpending(entries, view, select)
  const series = spendingSeries(entries, view, select)
  const average = (() => {
    const before = series.slice(0, -1).map((point) => point.spent)
    return before.length > 0 ? before.reduce((sum, value) => sum + value, 0) / before.length : null
  })()
  const mine = entries.filter(select)
  const current = { count: series.at(-1)?.count ?? 0, spent: series.at(-1)?.spent ?? 0 }
  // ANA-26: against the lookback's average period.
  const lookback = lookbackPeriods(view, 6)
  const before = lookback.length
    ? {
        spent: Math.round(
          usual.periods.reduce((sum, item) => sum + item.spent, 0) / lookback.length,
        ),
        count: Math.round(
          series.slice(-1 - lookback.length, -1).reduce((sum, point) => sum + point.count, 0) /
            lookback.length,
        ),
      }
    : null
  const split = before && !going ? splitChange(before, current) : null
  const range = lookbackRange(view)
  // A Locked category lands on its own date, so its weekdays and a what-if cut say
  // nothing; what-if cuts are for Flexible categories only (ANA-32).
  const locked = category?.flexibility === 'locked'
  const days = locked ? [] : byWeekday(entries, range, select)
  const short = words.weekdays('short')
  const busiest = days.indexOf(Math.max(...days))
  const children = by === 'group' ? breakdown(mine, view.period, 'category') : []
  const payees = by === 'payee' ? [] : breakdown(mine, range, 'payee').slice(0, 3)
  const savings = category?.flexibility === 'flexible' && usual.usual ? cutSavings(usual.usual) : []
  const periodName = words.period(view.period, view.scope)

  const kind = t(`analysis.slice.kinds.${by}`, { group: group?.name ?? '' })
  const compareRow = (label: string, amount: number | null) =>
    amount === null ? null : (
      <FigureRow
        key={label}
        title={label}
        subtitle={versusLine(compared.current, amount, words)}
        trailing={words.amount(amount)}
      />
    )

  return (
    <Page
      title={self.name}
      back={back}
      card={{
        icon: category ? (
          <CategoryTile category={category} group={group} size="large" />
        ) : (
          self.leading
        ),
        description: kind,
      }}
    >
      <PeriodHeader analysis={analysis} />
      <HeroCard
        label={
          going ? t('analysis.hero.spentSoFar') : t('analysis.hero.spentIn', { period: periodName })
        }
        amount={words.hero(compared.current)}
        context={
          usual.usual === null
            ? t('analysis.hero.noHistory')
            : t('analysis.slice.usual', { amount: words.text(usual.usual) })
        }
      />

      {/* ANA-12 */}
      <SectionLabel>{t('analysis.slice.compare')}</SectionLabel>
      <ul className="overflow-hidden rounded-2xl bg-surface">
        {compareRow(t(`analysis.slice.previous.${view.scope}`), compared.previous)}
        {compareRow(t(`analysis.slice.average.${view.scope}`, { count: 3 }), compared.average3)}
        {compareRow(t(`analysis.slice.average.${view.scope}`, { count: 6 }), compared.average6)}
        {compareRow(t(`analysis.slice.average.${view.scope}`, { count: 12 }), compared.average12)}
        {compared.previous === null && <FigureRow title={t('analysis.hero.noHistory')} />}
      </ul>
      {going && compared.previous !== null && (
        <p className="px-4 text-[0.8125rem] text-text-muted">
          {t('analysis.slice.sameDays', { date: words.date(analysis.today) })}
        </p>
      )}

      {/* ANA-11 */}
      <SectionLabel>{t(`analysis.slice.history.${view.scope}`)}</SectionLabel>
      <Card className="flex flex-col gap-3">
        <ColumnChart
          columns={series.map((point, index) => ({
            key: point.period.start,
            label:
              view.scope === 'month'
                ? words.monthShort(point.period)
                : words.period(point.period, view.scope),
            value: Math.max(0, point.spent),
            description: t('analysis.trends.monthValue', {
              month: words.period(point.period, view.scope),
              amount: words.text(point.spent),
            }),
            highlight: index === series.length - 1,
          }))}
          average={average}
          color={self.color}
          onSelect={(column) => {
            void navigate({
              to: '/transactions',
              search: drillDown({ start: column.key, end: column.key }, view.scope, { by, id }),
            })
          }}
        />
        {average !== null && (
          <p className="text-[0.9375rem] text-text-muted">
            {t('analysis.trends.average', { amount: words.text(Math.round(average)) })}
          </p>
        )}
      </Card>

      {/* ANA-23, ANA-26 */}
      <SectionLabel>{t('analysis.slice.purchases')}</SectionLabel>
      <ul className="overflow-hidden rounded-2xl bg-surface">
        <FigureRow
          title={t('analysis.slice.count')}
          trailing={
            <span className="text-[0.9375rem] text-text tabular-nums">{current.count}</span>
          }
        />
        <FigureRow
          title={t('analysis.slice.ticket')}
          trailing={words.amount(current.count > 0 ? Math.round(current.spent / current.count) : 0)}
        />
      </ul>
      {split && split.difference !== 0 && before && (
        <p className="px-4 text-[0.8125rem] text-text-muted">
          {t(split.difference > 0 ? 'analysis.slice.splitUp' : 'analysis.slice.splitDown', {
            amount: words.text(Math.abs(split.difference)),
            frequency: words.text(Math.abs(split.frequency)),
            price: words.text(Math.abs(split.price)),
          })}
        </p>
      )}

      {/* ANA-10: a group's categories. */}
      {children.length > 0 && (
        <>
          <SectionLabel>{t('analysis.slice.categories')}</SectionLabel>
          <ul className="overflow-hidden rounded-2xl bg-surface">
            {children.map((child) => {
              const childLook = look('category', child.key)
              return (
                <SliceLink
                  key={child.key}
                  by="category"
                  id={child.key}
                  leading={childLook.leading}
                  title={childLook.name}
                  subtitle={words.share(child.share)}
                  trailing={words.amount(child.spent)}
                />
              )
            })}
          </ul>
        </>
      )}

      {/* ANA-22 */}
      {days.length > 0 && Math.max(...days) > 0 && (
        <>
          <SectionLabel>{t('analysis.when.weekdays')}</SectionLabel>
          <Card className="flex flex-col gap-3">
            <ColumnChart
              color={self.color}
              columns={days.map((value, day) => ({
                key: String(day),
                label: short[day] ?? '',
                value,
                description: t('analysis.when.weekdayValue', {
                  day: words.weekdays('long')[day],
                  amount: words.text(value),
                }),
                highlight: day === busiest,
              }))}
            />
            <p className="text-[0.9375rem] text-text-muted">
              {t('analysis.when.weekdaySentence', {
                day: t(`analysis.weekdaysPlural.${String(busiest)}`),
                amount: words.text(days[busiest] ?? 0),
              })}
            </p>
          </Card>
        </>
      )}

      {/* ANA-14 */}
      {payees.length > 0 && (
        <>
          <SectionLabel>{t('analysis.slice.payees')}</SectionLabel>
          <ul className="overflow-hidden rounded-2xl bg-surface">
            {payees.map((payee) => {
              const payeeLook = look('payee', payee.key)
              return (
                <SliceLink
                  key={payee.key}
                  by="payee"
                  id={payee.key}
                  leading={payeeLook.leading}
                  title={payeeLook.name}
                  subtitle={t('analysis.slice.purchaseCount', { count: payee.count })}
                  trailing={words.amount(payee.spent)}
                />
              )
            })}
          </ul>
        </>
      )}

      {/* ANA-32 */}
      {savings.length > 0 && (
        <>
          <SectionLabel>{t('analysis.slice.savings')}</SectionLabel>
          <ul className="overflow-hidden rounded-2xl bg-surface">
            {savings.map((saving) => (
              <FigureRow
                key={saving.percent}
                title={t('analysis.slice.less', { percent: saving.percent })}
                subtitle={t('analysis.slice.perYear', { amount: words.text(saving.perYear) })}
                trailing={
                  <span className="flex flex-col items-end">
                    {words.amount(saving.perPeriod)}
                    <span className="text-[0.75rem] text-text-muted">
                      {t('analysis.cut.perMonth')}
                    </span>
                  </span>
                }
              />
            ))}
          </ul>
        </>
      )}

      <ul className="overflow-hidden rounded-2xl bg-surface">
        <TransactionsLink
          title={t('analysis.slice.transactions')}
          search={drillDown(view.period, view.scope, { by, id })}
        />
      </ul>
    </Page>
  )
}

/** ANA-12: how the current period compares with one figure, in words. */
function versusLine(current: number, other: number, words: Words) {
  const versus = words.versusUsual(current, other, 'compare')
  return versus ? (
    <span className={versus.flagged ? 'text-warning' : undefined}>{versus.text}</span>
  ) : undefined
}
