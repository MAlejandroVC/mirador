import { matchingByName } from '@repo/core'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChoiceRow } from '../../components/ui/choice-row'
import { List } from '../../components/ui/list'
import { SearchField } from '../../components/ui/search-field'
import { Sheet } from '../../components/ui/sheet'

export interface PickItem {
  id: string
  name: string
  leading?: ReactNode
  /** A section to list it under, such as its category group. */
  section?: string
}

// TXN-22: choosing any number of wallets, categories, tags or payees to filter by.
// Choosing none means any. Long lists get a search box.
export function MultiPicker({
  open,
  title,
  items,
  value,
  onChange,
  onClose,
}: {
  open: boolean
  title: string
  items: readonly PickItem[]
  value: readonly string[]
  onChange: (ids: string[]) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const searching = query.trim() !== ''
  const shown = searching ? matchingByName(items, query) : items
  const sections = [...new Set(shown.map((item) => item.section ?? ''))]
  const row = (item: PickItem) => (
    <ChoiceRow
      key={item.id}
      leading={item.leading}
      title={item.name}
      checked={value.includes(item.id)}
      onToggle={() => {
        onChange(
          value.includes(item.id) ? value.filter((id) => id !== item.id) : [...value, item.id],
        )
      }}
    />
  )
  return (
    <Sheet
      open={open}
      title={title}
      doneLabel={t('nav.done')}
      onClose={() => {
        setQuery('')
        onClose()
      }}
    >
      {items.length > 8 && (
        <SearchField
          label={t('filters.search')}
          clearLabel={t('pickers.clear')}
          value={query}
          onChange={setQuery}
        />
      )}
      <List inset>
        <ChoiceRow
          title={t('filters.any')}
          checked={value.length === 0}
          onToggle={() => {
            onChange([])
          }}
        />
      </List>
      {searching || sections.length <= 1 ? (
        <List inset>{shown.map(row)}</List>
      ) : (
        sections.map((section) => (
          <List key={section} label={section} inset>
            {shown.filter((item) => (item.section ?? '') === section).map(row)}
          </List>
        ))
      )}
    </Sheet>
  )
}
