import { tagUsage } from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { IconTile } from '../../components/ui/icon-tile'
import { PlusIcon, TagIcon } from '../../components/ui/icons'
import { List, ListButtonRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { useLedger } from '../wallets/use-ledger'
import { TagSheet, type TagSheetMode } from './tag-sheet'

// Settings > Tags (CAT-21): every tag with its color and how many transactions carry
// it. Archived ones follow under their own label (CAT-07 applies to tags too).
export function TagsScreen() {
  const { t } = useTranslation()
  const back = useBack()
  const { data: ledger } = useLedger()
  const [mode, setMode] = useState<TagSheetMode | null>(null)
  const [last, setLast] = useState<TagSheetMode>({ kind: 'new' })
  const open = (next: TagSheetMode) => {
    setMode(next)
    setLast(next)
  }
  const usage = tagUsage(ledger?.transactions ?? [])
  const tags = ledger?.tags ?? []

  const row = (tag: (typeof tags)[number]) => (
    <ListButtonRow
      key={tag.id}
      id={tag.id}
      tone="text"
      leading={<IconTile icon={TagIcon} color={tag.color} />}
      title={tag.name}
      trailing={
        <span className="text-[0.9375rem] text-text-muted tabular-nums">
          {usage.get(tag.id) ?? 0}
        </span>
      }
      onClick={() => {
        open({ kind: 'edit', tag })
      }}
    />
  )

  return (
    <Page
      title={t('tags.title')}
      back={back}
      card={{
        icon: <IconTile icon={TagIcon} size="large" />,
        description: t('tags.description'),
      }}
    >
      {ledger && (
        <>
          <List>
            {tags.filter((tag) => !tag.archived).map(row)}
            <ListButtonRow
              leading={
                <span aria-hidden className="grid size-[2.125rem] shrink-0 place-items-center">
                  <PlusIcon className="size-[1.375rem] text-brand" />
                </span>
              }
              title={t('tags.addTag')}
              onClick={() => {
                open({ kind: 'new' })
              }}
            />
          </List>
          {tags.some((tag) => tag.archived) && (
            <List label={t('tags.archived')}>{tags.filter((tag) => tag.archived).map(row)}</List>
          )}
          <TagSheet
            open={mode !== null}
            mode={mode ?? last}
            ledger={ledger}
            onClose={() => {
              setMode(null)
            }}
          />
        </>
      )}
    </Page>
  )
}
