import {
  byWeekday,
  byWeekOfPeriod,
  dailySpending,
  lookbackPeriods,
  monthOf,
  paydaySpending,
  sameDayPairs,
  smallPurchases,
  tagDays,
} from '@repo/core'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CalendarDotsIcon } from '../../components/ui/icons'
import { amountTip } from './chart-pointer'
import { ColumnChart, Heatmap } from './charts'
import { DetailPage } from './detail-page'
import { Card, FigureRow, SectionLabel, SliceLink } from './parts'
import { useSliceLook } from './use-slice-look'
import { PeriodHeader } from './period-header'
import { lookbackRange } from './queries'
import type { Analysis } from './use-analysis'
import { useWords } from './use-words'

// ANA-20, ANA-22, ANA-28, ANA-29, ANA-37: when and how the money goes. The calendar is
// the period shown; the patterns use it and the 6 periods before, so one odd week
// doesn't make a habit.
export function WhenScreen() {
  const { t } = useTranslation()
  return (
    <DetailPage
      title={t('analysis.when.title')}
      description={t('analysis.when.description')}
      icon={CalendarDotsIcon}
    >
      {(analysis) => <When analysis={analysis} />}
    </DetailPage>
  )
}

function When({ analysis }: { analysis: Analysis }) {
  const navigate = useNavigate()
  const words = useWords(analysis.context.currency, analysis.today)
  const { t } = words
  const look = useSliceLook(analysis)
  const { entries, view, today } = analysis
  const range = lookbackRange(view)
  const span = t('analysis.when.span', {
    from: words.date(range.start),
    to: words.date(range.end),
  })
  const month = view.scope === 'week' || view.scope === 'month' ? monthOf(view.period.start) : null
  const daily = month ? dailySpending(entries, month) : null
  const days = byWeekday(entries, range)
  const short = words.weekdays('short')
  const narrow = words.weekdays('narrow')
  const busiest = days.indexOf(Math.max(...days))
  const months = [
    ...lookbackPeriods({ ...view, period: monthOf(view.period.start), scope: 'month' }),
    monthOf(view.period.start),
  ]
  const weeks = byWeekOfPeriod(entries, months)
  const payday = paydaySpending(entries, range)
  const tags = tagDays(entries, range)
    .filter((tag) => tag.days >= 2)
    .slice(0, 5)
  const pairs = sameDayPairs(entries, range).slice(0, 5)
  const small = smallPurchases(entries, range)
  const larger = small.groups.filter((group) => group.spent < small.total)

  return (
    <>
      <PeriodHeader analysis={analysis} />

      {/* ANA-20: each day of the month, shaded by what was spent. */}
      {month && daily && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-[0.9375rem] font-semibold text-text">
            {t('analysis.when.calendar')}
          </h2>
          <Heatmap
            month={month.start}
            daily={daily}
            today={today}
            weekdays={narrow}
            describe={(date, spent) =>
              t('analysis.when.day', { date: words.date(date), amount: words.text(spent) })
            }
            onSelect={(date) => {
              // ANA-04: the week around that day, in the transaction list.
              void navigate({ to: '/transactions', search: { date, scope: 'week' } })
            }}
            tip={(date, spent) => amountTip(words.date(date), words.text(spent))}
          />
        </Card>
      )}

      {/* ANA-22: the days of the week, on average. */}
      <SectionLabel detail={span}>{t('analysis.when.weekdays')}</SectionLabel>
      <Card className="flex flex-col gap-3">
        <ColumnChart
          columns={days.map((value, day) => ({
            key: String(day),
            label: short[day] ?? '',
            value,
            description: t('analysis.when.weekdayValue', {
              day: words.weekdays('long')[day],
              amount: words.text(value),
            }),
            highlight: day === busiest && value > 0,
          }))}
          tip={(column) =>
            amountTip(
              words.weekdays('long')[Number(column.key)] ?? column.label,
              words.text(column.value),
            )
          }
        />
        {Math.max(...days) > 0 && (
          <p className="text-[0.9375rem] text-text-muted">
            {t('analysis.when.weekdaySentence', {
              day: t(`analysis.weekdaysPlural.${String(busiest)}`),
              amount: words.text(days[busiest] ?? 0),
            })}
          </p>
        )}
      </Card>

      {/* ANA-22: the weeks of the month, and the days right after payday. */}
      <SectionLabel>{t('analysis.when.weeks')}</SectionLabel>
      <Card className="flex flex-col gap-3">
        <ColumnChart
          columns={weeks.map((value, week) => ({
            key: String(week),
            label: t('analysis.when.week', { number: week + 1 }),
            value,
            description: t('analysis.when.weekValue', {
              number: week + 1,
              amount: words.text(value),
            }),
          }))}
          tip={(column) => amountTip(column.label, words.text(column.value))}
        />
        {payday.paydays > 0 && (
          <p className="text-[0.9375rem] text-text-muted">
            {t('analysis.when.payday', {
              after: words.text(payday.after),
              other: words.text(payday.otherDays),
            })}
          </p>
        )}
      </Card>

      {/* ANA-28: what a day with a tag costs. */}
      {tags.length > 0 && (
        <>
          <SectionLabel>{t('analysis.when.tags')}</SectionLabel>
          <ul className="overflow-hidden rounded-2xl bg-surface">
            {tags.map((tag) => {
              const tagLook = look('tag', tag.tagId)
              const top = tag.categories[0]
              return (
                <SliceLink
                  key={tag.tagId}
                  by="tag"
                  id={tag.tagId}
                  leading={tagLook.leading}
                  title={tagLook.name}
                  subtitle={
                    <>
                      {t('analysis.when.tagDay', {
                        with: words.text(tag.withTag),
                        without: words.text(tag.withoutTag),
                      })}
                      {top && top.withTag > top.withoutTag && (
                        <>
                          {' '}
                          {t('analysis.when.tagMostly', {
                            category: look('category', top.categoryId).name,
                          })}
                        </>
                      )}
                    </>
                  }
                />
              )
            })}
          </ul>
        </>
      )}

      {/* ANA-29: what tends to come along on the same day. */}
      {pairs.length > 0 && (
        <>
          <SectionLabel>{t('analysis.when.pairs')}</SectionLabel>
          <ul className="overflow-hidden rounded-2xl bg-surface">
            {pairs.map((pair) => (
              <FigureRow
                key={`${pair.first} ${pair.second}`}
                leading={look('category', pair.second).leading}
                title={t('analysis.when.pair', {
                  first: look('category', pair.first).name,
                  second: look('category', pair.second).name,
                })}
                subtitle={t('analysis.when.pairDetail', {
                  together: pair.together,
                  days: pair.days,
                  amount: words.text(pair.usual),
                })}
              />
            ))}
          </ul>
        </>
      )}

      {/* ANA-37: many small purchases, added up. */}
      {small.count > 0 && (
        <>
          <SectionLabel>{t('analysis.when.small')}</SectionLabel>
          <Card className="flex flex-col gap-1">
            <p className="text-[0.9375rem] text-text">
              {t('analysis.when.smallSentence', {
                count: small.count,
                below: words.text(small.below),
                total: words.text(small.total),
              })}
            </p>
            {larger[0] && (
              <p className="text-[0.9375rem] text-text-muted">
                {t('analysis.when.smallMore', {
                  group: look('group', larger[0].groupId).name,
                  amount: words.text(larger[0].spent),
                })}
              </p>
            )}
          </Card>
        </>
      )}
    </>
  )
}
