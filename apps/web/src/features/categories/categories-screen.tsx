import { categoryGroupRecord, categoryGroupRecordType } from '@repo/api'
import { type Category, type CategoryGroup, reordered } from '@repo/core'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsBack } from '../../components/shell/settings-back'
import { IconTile } from '../../components/ui/icon-tile'
import { ArrowsDownUpIcon, FolderSimpleIcon, PlusIcon } from '../../components/ui/icons'
import { List, ListButtonRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { ReorderSheet } from '../../components/ui/reorder-sheet'
import { ShowMoreRow } from '../../components/ui/show-more-row'
import { recordBody, useLedger, useSaveRecords } from '../wallets/use-ledger'
import { CategorySheet, type CategorySheetMode } from './category-sheet'
import { CategoryTile, TagDot } from './category-tile'
import { GroupSheet, type GroupSheetMode } from './group-sheet'
import { StarterChoice } from './starter-choice'

// Settings > Categories (Epic 4): every category group with its categories, in the
// person's order. Tapping a group or a category opens it; each group ends with a row
// to add a category to it. Archived ones wait folded at the end (CAT-07).
export function CategoriesScreen() {
  const { t } = useTranslation()
  const back = useSettingsBack()
  const { data: ledger } = useLedger()
  const save = useSaveRecords()
  const [category, setCategory] = useState<CategorySheetMode | null>(null)
  const [group, setGroup] = useState<GroupSheetMode | null>(null)
  // Kept while a sheet slides away, so it leaves showing what it showed.
  const [lastCategory, setLastCategory] = useState<CategorySheetMode>({
    kind: 'new',
    groupId: null,
  })
  const [lastGroup, setLastGroup] = useState<GroupSheetMode>({ kind: 'new' })
  const [reordering, setReordering] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const openCategory = (mode: CategorySheetMode) => {
    setCategory(mode)
    setLastCategory(mode)
  }
  const openGroup = (mode: GroupSheetMode) => {
    setGroup(mode)
    setLastGroup(mode)
  }

  const page = (children: ReactNode) => (
    <Page
      title={t('categories.title')}
      back={back}
      card={{
        icon: <IconTile icon={FolderSimpleIcon} size="large" />,
        description: t('categories.description'),
      }}
    >
      {children}
    </Page>
  )

  if (!ledger) return page(null)
  if (ledger.categories.length === 0) return page(<StarterChoice />)

  const activeGroups = ledger.groups.filter((item) => !item.archived)
  const archivedGroups = ledger.groups.filter((item) => item.archived)
  const archivedCategories = ledger.categories.filter(
    (item) => item.archived && !archivedGroups.some((archived) => archived.id === item.groupId),
  )
  const groupsById = new Map(ledger.groups.map((item) => [item.id, item]))

  const categoryRow = (item: Category, groupOf: CategoryGroup | undefined) => (
    <ListButtonRow
      key={item.id}
      id={item.id}
      tone="text"
      leading={<CategoryTile category={item} group={groupOf} />}
      title={item.name}
      {...(item.systemKey ? { subtitle: t('categories.system') } : {})}
      onClick={() => {
        openCategory({ kind: 'edit', category: item })
      }}
    />
  )

  return page(
    <>
      {activeGroups.map((item) => (
        <List key={item.id}>
          {/* CAT-14: the group's row carries its color; tapping it opens the group. */}
          <ListButtonRow
            id={item.id}
            tone="text"
            leading={<IconTile icon={FolderSimpleIcon} color={item.color} />}
            title={<span className="font-semibold">{item.name}</span>}
            trailing={
              <span className="text-[0.9375rem] text-text-muted">{t('categories.edit')}</span>
            }
            onClick={() => {
              openGroup({ kind: 'edit', group: item })
            }}
          />
          {ledger.categories
            .filter((entry) => entry.groupId === item.id && !entry.archived)
            .map((entry) => categoryRow(entry, item))}
          <ListButtonRow
            leading={
              // The same width as a tile, so its text lines up with the names above.
              <span aria-hidden className="grid size-[2.125rem] shrink-0 place-items-center">
                <PlusIcon className="size-[1.375rem] text-brand" />
              </span>
            }
            title={t('categories.add')}
            onClick={() => {
              openCategory({ kind: 'new', groupId: item.id })
            }}
          />
        </List>
      ))}

      <List>
        <ListButtonRow
          leading={<PlusIcon aria-hidden className="size-[1.375rem] text-brand" />}
          title={t('categories.group.add')}
          onClick={() => {
            openGroup({ kind: 'new' })
          }}
        />
        {activeGroups.length > 1 && (
          <ListButtonRow
            leading={<ArrowsDownUpIcon aria-hidden className="size-[1.375rem] text-brand" />}
            title={t('categories.group.reorderAll')}
            onClick={() => {
              setReordering(true)
            }}
          />
        )}
      </List>

      {(archivedGroups.length > 0 || archivedCategories.length > 0) && (
        <List label={t('categories.archived')}>
          {showArchived && (
            <>
              {archivedGroups.map((item) => (
                <ListButtonRow
                  key={item.id}
                  tone="text"
                  leading={<IconTile icon={FolderSimpleIcon} color={item.color} />}
                  title={item.name}
                  subtitle={t('categories.archivedGroup')}
                  onClick={() => {
                    openGroup({ kind: 'edit', group: item })
                  }}
                />
              ))}
              {archivedCategories.map((entry) => categoryRow(entry, groupsById.get(entry.groupId)))}
            </>
          )}
          <ShowMoreRow
            open={showArchived}
            more={t('categories.showArchived', {
              count: archivedGroups.length + archivedCategories.length,
            })}
            less={t('categories.hideArchived')}
            separator={showArchived}
            onToggle={() => {
              setShowArchived(!showArchived)
            }}
          />
        </List>
      )}

      <CategorySheet
        open={category !== null}
        mode={category ?? lastCategory}
        ledger={ledger}
        onClose={() => {
          setCategory(null)
        }}
      />
      <GroupSheet
        open={group !== null}
        mode={group ?? lastGroup}
        ledger={ledger}
        onClose={() => {
          setGroup(null)
        }}
      />
      <ReorderSheet
        open={reordering}
        title={t('categories.group.reorderAll')}
        intro={t('categories.group.reorderAllIntro')}
        items={activeGroups.map((item) => ({
          id: item.id,
          name: item.name,
          leading: <TagDot color={item.color} />,
        }))}
        pending={save.isPending}
        failed={save.isError}
        onSave={(ids, done) => {
          const changes = reordered(ids.flatMap((id) => groupsById.get(id) ?? [])).map(
            ({ id, ...item }) => ({
              id,
              body: recordBody(categoryGroupRecordType, categoryGroupRecord.parse(item)),
            }),
          )
          if (changes.length === 0) {
            setReordering(false)
            return
          }
          save.mutate(changes, { onSuccess: done })
        }}
        onClose={() => {
          setReordering(false)
        }}
      />
    </>,
  )
}
