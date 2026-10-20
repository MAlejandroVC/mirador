import { type CommittedItem, recurringCharges } from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClockCountdownIcon } from '../../components/ui/icons'
import { CategoryTile } from '../categories/category-tile'
import { amountTip } from './chart-pointer'
import { ColumnChart } from './charts'
import { DetailPage } from './detail-page'
import { Card, FigureRow, SectionLabel } from './parts'
import { committedFor } from './queries'
import type { Analysis } from './use-analysis'
import { useWords, type Words } from './use-words'

// ANA-27, ANA-24: what the coming months already owe (installment parts and recurring
// expenses), and the charges that come back on their own, with what they cost a year.
export function ComingScreen() {
  const { t } = useTranslation()
  return (
    <DetailPage
      title={t('analysis.coming.title')}
      description={t('analysis.coming.description')}
      icon={ClockCountdownIcon}
    >
      {(analysis) => <Coming analysis={analysis} />}
    </DetailPage>
  )
}

function Coming({ analysis }: { analysis: Analysis }) {
  const words = useWords(analysis.context.currency, analysis.today)
  const { t } = words
  const months = committedFor(analysis, 12)
  // Next month first, the one the tile on Budget names; the rest of this one is a tap away.
  const [chosen, setChosen] = useState(1)
  const month = months[chosen] ?? months[0]
  const repeats = recurringCharges(analysis.entries, analysis.today)

  return (
    <>
      <Card className="flex flex-col gap-3">
        <ColumnChart
          columns={months.map((item, index) => ({
            key: item.period.start,
            label: words.monthShort(item.period),
            value: item.total,
            description: t('analysis.coming.monthValue', {
              month: words.period(item.period, 'month'),
              amount: words.text(item.total),
            }),
            highlight: index === chosen,
          }))}
          onSelect={(column) => {
            setChosen(months.findIndex((item) => item.period.start === column.key))
          }}
          tip={(column) => {
            const item = months.find((each) => each.period.start === column.key)
            return amountTip(
              item ? words.period(item.period, 'month') : column.label,
              words.text(column.value),
            )
          }}
        />
        <p className="text-[0.8125rem] text-text-muted">{t('analysis.coming.hint')}</p>
      </Card>

      {month && (
        <>
          <SectionLabel detail={words.text(month.total)}>
            {words.period(month.period, 'month')}
          </SectionLabel>
          {month.items.length === 0 ? (
            <Card>
              <p className="text-center text-[0.9375rem] text-text-muted">
                {t('analysis.coming.none')}
              </p>
            </Card>
          ) : (
            <ul className="overflow-hidden rounded-2xl bg-surface">
              {month.items.map((item) => (
                <ItemRow
                  key={`${item.id} ${item.date}`}
                  item={item}
                  analysis={analysis}
                  words={words}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {/* ANA-24 */}
      <SectionLabel>{t('analysis.coming.repeats')}</SectionLabel>
      {repeats.length === 0 ? (
        <Card>
          <p className="text-center text-[0.9375rem] text-text-muted">
            {t('analysis.coming.noRepeats')}
          </p>
        </Card>
      ) : (
        <>
          <ul className="overflow-hidden rounded-2xl bg-surface">
            {repeats.map((charge) => {
              const category =
                charge.categoryId === null
                  ? undefined
                  : analysis.lookups.categories.get(charge.categoryId)
              const name =
                (charge.payeeId && analysis.lookups.payees.get(charge.payeeId)?.name) ??
                charge.note ??
                category?.name ??
                ''
              return (
                <FigureRow
                  key={`${name} ${charge.last}`}
                  leading={
                    category && (
                      <CategoryTile
                        category={category}
                        group={analysis.lookups.groupOf(category)}
                      />
                    )
                  }
                  title={name}
                  subtitle={
                    <>
                      {t(`analysis.coming.every.${charge.every.unit}`, {
                        amount: words.text(charge.amount),
                        count: charge.every.count,
                      })}
                      {!charge.scheduled && ` · ${t('analysis.coming.notScheduled')}`}
                    </>
                  }
                  trailing={
                    <span className="flex flex-col items-end">
                      {words.amount(charge.yearly)}
                      <span className="text-[0.75rem] text-text-muted">
                        {t('analysis.coming.perYear')}
                      </span>
                    </span>
                  }
                />
              )
            })}
          </ul>
          <p className="px-4 text-[0.8125rem] text-text-muted">
            {t('analysis.coming.repeatsHint')}
          </p>
        </>
      )}
    </>
  )
}

function ItemRow({
  item,
  analysis,
  words,
}: {
  item: CommittedItem
  analysis: Analysis
  words: Words
}) {
  const { t } = words
  const { lookups } = analysis
  const category = item.categoryId === null ? undefined : lookups.categories.get(item.categoryId)
  const name =
    (item.payeeId && lookups.payees.get(item.payeeId)?.name) ??
    item.note ??
    category?.name ??
    t('analysis.unknown')
  return (
    <FigureRow
      leading={category && <CategoryTile category={category} group={lookups.groupOf(category)} />}
      title={name}
      subtitle={`${words.date(item.date)} · ${t(`analysis.coming.${item.source}`)}`}
      trailing={words.amount(item.amount)}
    />
  )
}
