import { breakdown, type SliceBy, usualSpending, type WalletPreset } from '@repo/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CaretRightIcon, ChartPieSliceIcon } from '../../components/ui/icons'
import { rowClass } from '../../components/ui/row'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { topParts } from './chart-colors'
import { amountTip } from './chart-pointer'
import { StackedBar } from './charts'
import { DetailPage } from './detail-page'
import { Card, FigureRow, SectionLabel, SliceLink, Versus } from './parts'
import { useSliceLook } from './use-slice-look'
import { PeriodHeader } from './period-header'
import type { Analysis } from './use-analysis'
import { useWords } from './use-words'

// DL-CMP-11: the three splits of what the money went to share a segmented control;
// payees and wallets, which say who got it and where it came from, open from rows.
const splits: readonly SliceBy[] = ['group', 'category', 'tag']

// ANA-10, ANA-14, ANA-17, ANA-23: where the money went in the period, split five ways,
// each with its share, how many purchases and their average, and how it compares
// with usual. Every row opens its own screen (drill-down to transactions, ANA-04).
export function WhereScreen({ by }: { by: SliceBy }) {
  const { t } = useTranslation()
  return (
    <DetailPage
      title={t('analysis.where.screenTitle')}
      description={t('analysis.where.description')}
      icon={ChartPieSliceIcon}
    >
      {(analysis) => <Where analysis={analysis} by={by} />}
    </DetailPage>
  )
}

function Where({ analysis, by }: { analysis: Analysis; by: SliceBy }) {
  const navigate = useNavigate()
  const words = useWords(analysis.context.currency, analysis.today)
  const { t } = words
  const look = useSliceLook(analysis)
  const { entries, view } = analysis
  const slices = breakdown(entries, view.period, by)
  const keyOf: Record<SliceBy, (entry: (typeof entries)[number]) => readonly string[]> = {
    group: (entry) => (entry.groupId === null ? [] : [entry.groupId]),
    category: (entry) => (entry.categoryId === null ? [] : [entry.categoryId]),
    tag: (entry) => entry.tagIds,
    payee: (entry) => (entry.payeeId === null ? [] : [entry.payeeId]),
    wallet: (entry) => [entry.walletId],
  }
  // ANA-17: by wallet type too.
  const presets = new Map<WalletPreset, number>()
  if (by === 'wallet')
    for (const slice of slices) {
      const preset = analysis.wallets.get(slice.key)?.preset
      if (preset) presets.set(preset, (presets.get(preset) ?? 0) + slice.spent)
    }

  return (
    <>
      <PeriodHeader analysis={analysis} />
      {splits.includes(by) ? (
        <SegmentedControl
          label={t('analysis.where.splitLabel')}
          options={splits.map((value) => ({ value, label: t(`analysis.where.by.${value}`) }))}
          value={by}
          onChange={(next) => {
            void navigate({ to: '/budget/where', search: { by: next }, replace: true })
          }}
        />
      ) : (
        <SectionLabel>{t(`analysis.where.by.${by}`)}</SectionLabel>
      )}
      {slices.length === 0 ? (
        <Card>
          <p className="text-center text-[0.9375rem] text-text-muted">{t('analysis.where.none')}</p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-1 px-0 pt-4 pb-0">
          <div className="px-4 pb-2">
            <StackedBar
              parts={topParts(
                slices.map((slice) => ({
                  key: slice.key,
                  value: slice.spent,
                  color: look(by, slice.key).color,
                })),
              )}
              tip={(part, share) =>
                amountTip(
                  part.key === 'other' ? t('analysis.other') : look(by, part.key).name,
                  `${words.text(part.value)} · ${words.share(share)}`,
                )
              }
            />
          </div>
          <ul>
            {slices.map((slice) => {
              const sliceLook = look(by, slice.key)
              const sliceUsual = usualSpending(entries, view, (entry) =>
                keyOf[by](entry).includes(slice.key),
              )
              return (
                <SliceLink
                  key={slice.key}
                  by={by}
                  id={slice.key}
                  leading={sliceLook.leading}
                  title={sliceLook.name}
                  subtitle={
                    <>
                      {/* The count and average purchase wait on the slice's own screen,
                          so a row stays two lines at 375 px. */}
                      {words.share(slice.share)}
                      {sliceUsual.usual !== null && (
                        <>
                          {' · '}
                          <Versus
                            versus={words.versusUsual(sliceUsual.current, sliceUsual.usual)}
                          />
                        </>
                      )}
                    </>
                  }
                  trailing={words.amount(slice.spent)}
                />
              )
            })}
          </ul>
        </Card>
      )}
      {by === 'tag' && slices.length > 0 && (
        <p className="px-4 text-[0.8125rem] text-text-muted">{t('analysis.where.tagsHint')}</p>
      )}
      {splits.includes(by) && (
        <ul className="overflow-hidden rounded-2xl bg-surface">
          {(['payee', 'wallet'] as const).map((other) => (
            <li key={other} className="group">
              <Link to="/budget/where" search={{ by: other }} className={rowClass}>
                <span className="flex min-h-[3.25rem] min-w-0 flex-1 items-center gap-2 self-stretch border-t-[0.5px] border-separator py-2 pr-4 group-first:border-t-0">
                  <span className="flex-1 text-[0.9375rem] text-text">
                    {t(`analysis.where.open.${other}`)}
                  </span>
                  <CaretRightIcon aria-hidden className="size-4 shrink-0 text-text-faint" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {presets.size > 1 && (
        <>
          <SectionLabel>{t('analysis.where.presets')}</SectionLabel>
          <ul className="overflow-hidden rounded-2xl bg-surface">
            {[...presets.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([preset, spent]) => (
                <FigureRow
                  key={preset}
                  title={t(`wallets.presets.${preset}`)}
                  trailing={words.amount(spent)}
                />
              ))}
          </ul>
        </>
      )}
    </>
  )
}
