import { whatChanged } from '@repo/core'
import { useTranslation } from 'react-i18next'
import { TrendUpIcon } from '../../components/ui/icons'
import { DetailPage } from './detail-page'
import { Card, SectionLabel, SliceLink } from './parts'
import { PeriodHeader } from './period-header'
import { changeSentence } from './sentences'
import { useSliceLook } from './use-slice-look'
import type { Analysis } from './use-analysis'
import { flagThreshold, useWords } from './use-words'

// ANA-12, ANA-26, ANA-30, ANA-33: every category against its usual period, split into
// what went up and what went down, each with a sentence on whether it comes from
// buying more often or paying more each time.
export function ChangesScreen() {
  const { t } = useTranslation()
  return (
    <DetailPage
      title={t('analysis.changed.title')}
      description={t('analysis.changed.description')}
      icon={TrendUpIcon}
    >
      {(analysis) => <Changes analysis={analysis} />}
    </DetailPage>
  )
}

function Changes({ analysis }: { analysis: Analysis }) {
  const words = useWords(analysis.context.currency, analysis.today)
  const { t } = words
  const look = useSliceLook(analysis)
  // A change under 5% of usual is noise, not news.
  const changes = whatChanged(analysis.entries, analysis.view, flagThreshold).filter(
    (item) => item.ratio === null || Math.abs(item.ratio) >= 0.05,
  )
  const sides = [
    { key: 'above', items: changes.filter((item) => item.difference > 0) },
    { key: 'below', items: changes.filter((item) => item.difference < 0) },
  ] as const

  return (
    <>
      <PeriodHeader analysis={analysis} />
      {changes.length === 0 ? (
        <Card>
          <p className="text-center text-[0.9375rem] text-text-muted">
            {t('analysis.changed.none')}
          </p>
        </Card>
      ) : (
        sides.map(
          (side) =>
            side.items.length > 0 && (
              <section key={side.key} className="flex flex-col gap-2">
                <SectionLabel>{t(`analysis.changed.${side.key}`)}</SectionLabel>
                <ul className="overflow-hidden rounded-2xl bg-surface">
                  {side.items.map((item) => {
                    const category = look('category', item.categoryId)
                    return (
                      <SliceLink
                        key={item.categoryId}
                        by="category"
                        id={item.categoryId}
                        leading={category.leading}
                        title={category.name}
                        subtitle={changeSentence(item, words)}
                        trailing={words.amount(item.current)}
                      />
                    )
                  })}
                </ul>
              </section>
            ),
        )
      )}
    </>
  )
}
