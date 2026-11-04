import { categoryRecord, categoryRecordType } from '@repo/api'
import { type Category, type Flexibility, toCalendarDate } from '@repo/core'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { ActionSheet } from '../../components/ui/action-sheet'
import { IconTile } from '../../components/ui/icon-tile'
import { SlidersHorizontalIcon } from '../../components/ui/icons'
import { List, ListButtonRow, ListRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { preferencesChange, recordBody, useLedger, useSaveRecords } from '../wallets/use-ledger'
import { CategoryTile } from './category-tile'

const kinds: readonly Flexibility[] = ['locked', 'fixed', 'flexible']

// CAT-26, BUD-10: every expense category sorted into commitments, needs and wants, so
// the person sees at once what the budget may suggest cutting. Tapping one offers the
// other two, so a change takes two taps instead of opening each category. Opened from
// Settings > Categories and from the card on Budget > Spending.
export function NeedsAndWantsScreen() {
  const { t } = useTranslation()
  const back = useBack()
  const { data: ledger } = useLedger()
  const save = useSaveRecords()
  const [picked, setPicked] = useState<Category | null>(null)
  // Kept while the sheet slides away, so it leaves showing what it showed.
  const [last, setLast] = useState<Category | null>(null)

  // DSH-09: having looked at this screen once finishes Get started's "Review your
  // categories" step, whether or not anything was moved.
  const reviewed = useRef(false)
  useEffect(() => {
    if (!ledger || reviewed.current || ledger.preferences?.categoriesReviewedOn) return
    reviewed.current = true
    save.mutate([preferencesChange(ledger, { categoriesReviewedOn: toCalendarDate(new Date()) })])
  }, [ledger, save])

  const page = (children: ReactNode) => (
    <Page
      title={t('categories.types.title')}
      back={back}
      card={{
        icon: <IconTile icon={SlidersHorizontalIcon} size="large" />,
        description: t('categories.types.description'),
      }}
    >
      {children}
    </Page>
  )

  if (!ledger) return page(null)

  // In the person's order: group by group, then within each group (CAT-01).
  const groups = ledger.groups.filter((group) => !group.archived)
  const groupsById = new Map(groups.map((group) => [group.id, group]))
  const expenses = groups.flatMap((group) =>
    ledger.categories.filter(
      (category) =>
        category.groupId === group.id && !category.archived && category.kind !== 'income',
    ),
  )

  const move = (category: Category, flexibility: Flexibility) => {
    const { id, ...fields } = category
    const record = categoryRecord.parse({ ...fields, flexibility })
    save.mutate([{ id, body: recordBody(categoryRecordType, record) }])
    setPicked(null)
  }

  const shown = picked ?? last

  return page(
    <>
      {kinds.map((kind) => {
        const members = expenses.filter((category) => category.flexibility === kind)
        return (
          <div key={kind} className="flex flex-col gap-1.5">
            <List label={t(`categories.flexibility.${kind}Plural`)} detail={members.length}>
              {members.length === 0 ? (
                <ListRow
                  title={<span className="text-text-muted">{t('categories.types.none')}</span>}
                />
              ) : (
                members.map((category) => (
                  <ListButtonRow
                    key={category.id}
                    id={category.id}
                    tone="text"
                    leading={
                      <CategoryTile category={category} group={groupsById.get(category.groupId)} />
                    }
                    title={category.name}
                    subtitle={groupsById.get(category.groupId)?.name}
                    onClick={() => {
                      setPicked(category)
                      setLast(category)
                    }}
                  />
                ))
              )}
            </List>
            {/* DL-CMP-09: what each one means, in a hint under it. */}
            <p className="px-4 text-[0.8125rem] text-text-muted">
              {t(`categories.flexibility.${kind}Hint`)}
            </p>
          </div>
        )
      })}

      {/* DL-CMP-12: the other two places it can go, with Cancel set apart. */}
      <ActionSheet
        open={picked !== null}
        title={shown?.name ?? ''}
        message={shown ? t(`categories.types.now.${shown.flexibility}`) : ''}
        actions={kinds
          .filter((kind) => kind !== shown?.flexibility)
          .map((kind) => ({
            label: t(`categories.types.moveTo.${kind}`),
            onSelect: () => {
              if (picked) move(picked, kind)
            },
          }))}
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          setPicked(null)
        }}
      />
    </>,
  )
}
