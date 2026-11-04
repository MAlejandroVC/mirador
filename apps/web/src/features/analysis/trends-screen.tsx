import {
  fractionDigits,
  incomeAndSpending,
  incomeSources,
  netWorthHistory,
  parseAmount,
  projection,
  spendingSeries,
  addMonths,
  shiftPeriod,
} from '@repo/core'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FieldNote, MoneyRow } from '../../components/ui/field-row'
import { ChartLineUpIcon } from '../../components/ui/icons'
import { CategoryTile } from '../categories/category-tile'
import { amountTip } from './chart-pointer'
import { TipMark } from './chart-tip'
import { ColumnChart, LineChart } from './charts'
import { DetailPage } from './detail-page'
import { Card, FigureRow, SectionLabel } from './parts'
import { drillDown, monthView, usualLeftOver } from './queries'
import type { Analysis } from './use-analysis'
import { useWords } from './use-words'

// ANA-11, ANA-25, ANA-16, ANA-40, ANA-15: the longer view, month by month: spending
// against its average, income against spending (lifestyle creep), net worth so far
// and where it heads at the usual left over, and where income comes from.
export function TrendsScreen() {
  const { t } = useTranslation()
  return (
    <DetailPage
      title={t('analysis.trends.title')}
      description={t('analysis.trends.description')}
      icon={ChartLineUpIcon}
    >
      {(analysis) => <Trends analysis={analysis} />}
    </DetailPage>
  )
}

function Trends({ analysis }: { analysis: Analysis }) {
  const navigate = useNavigate()
  const words = useWords(analysis.context.currency, analysis.today)
  const { t } = words
  const { entries, ledger, today, lookups } = analysis
  const month = monthView(analysis)
  const currency = analysis.context.currency
  const [targetText, setTargetText] = useState('')

  const series = spendingSeries(entries, month)
  const complete = series.slice(0, -1).map((point) => point.spent)
  const average =
    complete.length > 0 ? complete.reduce((sum, value) => sum + value, 0) / complete.length : null
  const flows = incomeAndSpending(entries, month)
  const history = netWorthHistory(ledger.wallets, ledger.transactions, analysis.context, today, 12)
  const now = history.at(-1)?.netWorth ?? 0
  const leftOver = usualLeftOver(analysis)
  const target = parseAmount(targetText, currency, words.locale)
  const ahead =
    leftOver === null
      ? null
      : projection(now, leftOver, 24, target && target > 0 ? target : undefined)
  const sources = incomeSources(entries, month)

  const steadiness = (variability: number) =>
    t(
      variability < 0.1
        ? 'analysis.trends.steady'
        : variability < 0.35
          ? 'analysis.trends.variesLittle'
          : 'analysis.trends.variesLot',
    )

  return (
    <>
      {/* ANA-11 */}
      <SectionLabel>{t('analysis.trends.spending')}</SectionLabel>
      <Card className="flex flex-col gap-3">
        <ColumnChart
          columns={series.map((point, index) => ({
            key: point.period.start,
            label: words.monthShort(point.period),
            value: point.spent,
            description: t('analysis.trends.monthValue', {
              month: words.period(point.period, 'month'),
              amount: words.text(point.spent),
            }),
            highlight: index === series.length - 1,
          }))}
          average={average}
          onSelect={(column) => {
            void navigate({
              to: '/transactions',
              search: drillDown({ start: column.key, end: column.key }, 'month'),
            })
          }}
          tip={(column) => {
            const point = series.find((each) => each.period.start === column.key)
            return amountTip(
              point ? words.period(point.period, 'month') : column.label,
              words.text(column.value),
            )
          }}
        />
        {average !== null && (
          <p className="text-[0.9375rem] text-text-muted">
            {t('analysis.trends.average', { amount: words.text(Math.round(average)) })}
          </p>
        )}
      </Card>

      {/* ANA-25 */}
      <SectionLabel>{t('analysis.trends.creep')}</SectionLabel>
      <Card className="flex flex-col gap-3">
        <LineChart
          label={t('analysis.trends.creepLabel')}
          lines={[
            { values: flows.points.map((point) => point.income), style: 'muted' },
            { values: flows.points.map((point) => point.spent), style: 'solid' },
          ]}
          tip={(index) => {
            const point = flows.points[index]
            if (!point) return null
            return {
              title: words.period(point.period, 'month'),
              rows: [
                {
                  key: 'spent',
                  label: t('analysis.totals.spent'),
                  value: words.text(point.spent),
                  mark: <TipMark kind="line" />,
                },
                {
                  key: 'income',
                  label: t('analysis.totals.income'),
                  value: words.text(point.income),
                  mark: <TipMark kind="dashedMuted" />,
                },
              ],
            }
          }}
        />
        <div aria-hidden className="flex gap-4 text-[0.75rem] text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded-full bg-brand" />
            {t('analysis.totals.spent')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-[1.5px] border-dashed border-text-muted" />
            {t('analysis.totals.income')}
          </span>
        </div>
        <p className="text-[0.9375rem] text-text-muted">
          {flows.spentChange === null || flows.incomeChange === null
            ? t('analysis.trends.creepLater')
            : t('analysis.trends.creepSentence', {
                spent: words.share(Math.abs(flows.spentChange)),
                spentWay: t(flows.spentChange >= 0 ? 'analysis.trends.up' : 'analysis.trends.down'),
                income: words.share(Math.abs(flows.incomeChange)),
                incomeWay: t(
                  flows.incomeChange >= 0 ? 'analysis.trends.up' : 'analysis.trends.down',
                ),
              })}
        </p>
      </Card>

      {/* ANA-16, ANA-40 */}
      <SectionLabel detail={words.text(now)}>{t('analysis.trends.netWorth')}</SectionLabel>
      <Card className="flex flex-col gap-3">
        <LineChart
          label={t('analysis.trends.netWorthLabel')}
          lines={[
            {
              values: [...history.map((point) => point.netWorth), ...Array<null>(24).fill(null)],
              style: 'solid',
            },
            ...(ahead
              ? [
                  {
                    values: [...Array<null>(history.length - 1).fill(null), ...ahead.points],
                    style: 'dashed' as const,
                  },
                ]
              : []),
          ]}
          tip={(index) => {
            // Past months show what net worth was; the months ahead, where it heads.
            const point = history[index]
            if (point)
              return amountTip(words.period(point.period, 'month'), words.text(point.netWorth))
            const step = index - (history.length - 1)
            const last = history.at(-1)
            const value = ahead?.points[step]
            if (!last || value === undefined) return null
            return {
              title: words.period(shiftPeriod(last.period.start, 'month', step), 'month'),
              rows: [
                {
                  key: 'projected',
                  label: t('analysis.trends.projected'),
                  value: words.text(value),
                  mark: <TipMark kind="projection" />,
                },
              ],
            }
          }}
        />
        <p className="text-[0.9375rem] text-text-muted">
          {ahead && leftOver !== null
            ? t('analysis.trends.projection', {
                amount: words.text(ahead.points.at(-1) ?? now),
                leftOver: words.text(leftOver),
              })
            : t('analysis.trends.projectionLater')}
        </p>
      </Card>
      {ahead && (
        // DL-CMP-09: the amount to reach, with what it means right under it.
        <div className="flex flex-col gap-1.5">
          <ul className="rounded-2xl bg-surface">
            <MoneyRow
              label={t('analysis.trends.target')}
              value={targetText}
              onChange={setTargetText}
              locale={words.locale}
              decimals={fractionDigits(currency)}
            />
          </ul>
          <FieldNote>
            {target && target > 0
              ? ahead.reachedIn === null
                ? t('analysis.trends.never')
                : ahead.reachedIn === 0
                  ? t('analysis.trends.already')
                  : t('analysis.trends.reachedIn', {
                      count: ahead.reachedIn,
                      month: words.period(
                        { start: addMonths(today, ahead.reachedIn, 1), end: today },
                        'month',
                      ),
                    })
              : t('analysis.trends.targetHint')}
          </FieldNote>
        </div>
      )}

      {/* ANA-15 */}
      {sources.length > 0 && (
        <>
          <SectionLabel>{t('analysis.trends.sources')}</SectionLabel>
          <ul className="overflow-hidden rounded-2xl bg-surface">
            {sources.map((source) => {
              const category =
                source.categoryId === null ? undefined : lookups.categories.get(source.categoryId)
              return (
                <FigureRow
                  key={source.categoryId ?? 'none'}
                  leading={
                    category && (
                      <CategoryTile category={category} group={lookups.groupOf(category)} />
                    )
                  }
                  title={category?.name ?? t('analysis.unknown')}
                  subtitle={steadiness(source.variability)}
                  trailing={
                    <span className="flex flex-col items-end">
                      {words.amount(source.average, 'moss')}
                      <span className="text-[0.75rem] text-text-muted">
                        {t('analysis.trends.perMonth')}
                      </span>
                    </span>
                  }
                />
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}
