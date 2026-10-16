import { matchingByName, nameTaken, suggestedTags, type Tag } from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChoiceRow } from '../../components/ui/choice-row'
import { PlusIcon } from '../../components/ui/icons'
import { List, ListButtonRow } from '../../components/ui/list'
import { SearchField } from '../../components/ui/search-field'
import { Sheet } from '../../components/ui/sheet'
import type { Transaction } from '@repo/core'
import { TagDot } from './category-tile'

// TXN-15, CAT-20, CAT-21, CAT-23: any number of tags, the ones used most with the
// category first. Typing a name that isn't a tag yet offers to add it.
export function TagPicker({
  open,
  tags,
  transactions,
  categoryId,
  value,
  onChange,
  onCreate,
  onClose,
}: {
  open: boolean
  tags: readonly Tag[]
  transactions: readonly Transaction[]
  categoryId: string | null
  value: readonly string[]
  onChange: (tagIds: string[]) => void
  /** Makes a new tag with this name and returns it; it is saved with the transaction. */
  onCreate: (name: string) => Tag
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} title={t('transactions.tags')} doneLabel={t('nav.done')} onClose={onClose}>
      {open && (
        <TagChoices
          tags={tags}
          transactions={transactions}
          categoryId={categoryId}
          value={value}
          onChange={onChange}
          onCreate={onCreate}
        />
      )}
    </Sheet>
  )
}

function TagChoices({
  tags,
  transactions,
  categoryId,
  value,
  onChange,
  onCreate,
}: {
  tags: readonly Tag[]
  transactions: readonly Transaction[]
  categoryId: string | null
  value: readonly string[]
  onChange: (tagIds: string[]) => void
  onCreate: (name: string) => Tag
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  // The order is fixed when the sheet opens, so a row never jumps under the finger.
  const [order] = useState(() =>
    suggestedTags(tags, transactions, categoryId, value).map((tag) => tag.id),
  )
  const byId = new Map(tags.map((tag) => [tag.id, tag]))
  const ordered = [
    ...order.flatMap((id) => byId.get(id) ?? []),
    ...tags.filter((tag) => !order.includes(tag.id) && !tag.archived),
  ]
  const name = query.trim()
  const shown = name === '' ? ordered : matchingByName(ordered, name)
  const canAdd = name !== '' && !nameTaken(name, tags)

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((tagId) => tagId !== id) : [...value, id])
  }

  return (
    <>
      <SearchField
        label={t('tags.search')}
        clearLabel={t('pickers.clear')}
        value={query}
        onChange={setQuery}
      />
      {canAdd && (
        <List inset>
          <ListButtonRow
            leading={<PlusIcon aria-hidden className="size-[1.375rem] text-brand" />}
            title={t('tags.add', { name })}
            onClick={() => {
              const tag = onCreate(name)
              onChange([...value, tag.id])
              setQuery('')
            }}
          />
        </List>
      )}
      {shown.length > 0 ? (
        <List inset>
          {shown.map((tag) => (
            <ChoiceRow
              key={tag.id}
              leading={<TagDot color={tag.color} />}
              title={tag.name}
              checked={value.includes(tag.id)}
              onToggle={() => {
                toggle(tag.id)
              }}
            />
          ))}
        </List>
      ) : (
        !canAdd && (
          <p className="px-4 py-6 text-center text-[0.9375rem] text-text-muted">{t('tags.none')}</p>
        )
      )}
    </>
  )
}
