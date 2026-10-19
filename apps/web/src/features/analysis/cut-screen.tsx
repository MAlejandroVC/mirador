import { improvements, seasons } from '@repo/core'
import { useTranslation } from 'react-i18next'
import { ScissorsIcon } from '../../components/ui/icons'
import { DetailPage } from './detail-page'
import { Card, FigureRow, SectionLabel, SliceLink } from './parts'
import { useSliceLook } from './use-slice-look'
import { monthView } from './queries'
import type { Analysis } from './use-analysis'
import { useWords } from './use-words'

// ANA-31, ANA-36: where cutting back is easiest, and the months that cost more. Only
// Flexible categories are ranked, and a step never asks for less than the person has
// already spent in a recent month, so it is something they have done before. The app
// never judges a category: it ranks by numbers only.
export function CutScreen() {
  const { t } = useTranslation()
  return (
    <DetailPage
      title={t('analysis.cut.title')}
      description={t('analysis.cut.description')}
      icon={ScissorsIcon}
    >
      {(analysis) => <Cut analysis={analysis} />}
    </DetailPage>
  )
}

function Cut({ analysis }: { analysis: Analysis }) {
  const words = useWords(analysis.context.currency, analysis.today)
  const { t } = words
  const look = useSliceLook(analysis)
  const ranked = improvements(analysis.entries, monthView(analysis), analysis.ledger.categories)
  const total = ranked.reduce((sum, item) => sum + item.potential, 0)
  const costly = seasons(analysis.entries, analysis.today, analysis.view.firstDate)

  return (
    <>
      {ranked.length === 0 ? (
        <Card>
          <p className="text-center text-[0.9375rem] text-text-muted">{t('analysis.cut.none')}</p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-1">
            <p className="text-[0.9375rem] text-text">
              {t('analysis.cut.total', {
                amount: words.text(total),
                year: words.text(total * 12),
                count: ranked.length,
              })}
            </p>
          </Card>
          <ul className="overflow-hidden rounded-2xl bg-surface">
            {ranked.map((item) => {
              const category = look('category', item.categoryId)
              const trend =
                item.trend === null || Math.abs(item.trend) < 0.05
                  ? null
                  : t(item.trend > 0 ? 'analysis.cut.growing' : 'analysis.cut.shrinking', {
                      percent: words.share(Math.abs(item.trend)),
                    })
              return (
                <SliceLink
                  key={item.categoryId}
                  by="category"
                  id={item.categoryId}
                  leading={category.leading}
                  title={category.name}
                  subtitle={[
                    t('analysis.cut.numbers', {
                      usual: words.text(item.usual),
                      lowest: words.text(item.proven),
                    }),
                    trend,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={
                    <span className="flex flex-col items-end">
                      {words.amount(item.potential)}
                      <span className="text-[0.75rem] text-text-muted">
                        {t('analysis.cut.perMonth')}
                      </span>
                    </span>
                  }
                />
              )
            })}
          </ul>
          <p className="px-4 text-[0.8125rem] text-text-muted">{t('analysis.cut.rule')}</p>
        </>
      )}

      {/* ANA-36 */}
      <SectionLabel>{t('analysis.cut.seasons')}</SectionLabel>
      {costly === null ? (
        <Card>
          <p className="text-center text-[0.9375rem] text-text-muted">
            {t('analysis.cut.seasonsLater')}
          </p>
        </Card>
      ) : costly.months.length === 0 ? (
        <Card>
          <p className="text-center text-[0.9375rem] text-text-muted">
            {t('analysis.cut.noSeasons')}
          </p>
        </Card>
      ) : (
        <>
          <ul className="overflow-hidden rounded-2xl bg-surface">
            {costly.months.map((month) => (
              <FigureRow
                key={month.month}
                title={new Intl.DateTimeFormat(words.locale, { month: 'long', timeZone: 'UTC' })
                  .format(new Date(Date.UTC(2023, month.month - 1, 1)))
                  .replace(/^./, (letter) => letter.toLocaleUpperCase(words.locale))}
                subtitle={t('analysis.cut.seasonDetail', {
                  amount: words.text(month.extra),
                  count: month.years.length,
                })}
                trailing={words.amount(month.spent)}
              />
            ))}
          </ul>
          <p className="px-4 text-[0.8125rem] text-text-muted">
            {t('analysis.cut.setAside', { amount: words.text(costly.setAside) })}
          </p>
        </>
      )}
    </>
  )
}
