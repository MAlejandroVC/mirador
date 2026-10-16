import {
  type Category,
  categoryUsage,
  frequentCategories,
  matchingByName,
  pickableCategories,
} from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChoiceRow } from '../../components/ui/choice-row'
import { List } from '../../components/ui/list'
import { SearchField } from '../../components/ui/search-field'
import { Sheet } from '../../components/ui/sheet'
import type { Ledger } from '../wallets/use-ledger'
import { CategoryTile } from './category-tile'
import { StarterChoice } from './starter-choice'

// How many of the most used categories lead the picker (CAT-12).
const frequentCount = 6

// CAT-02, CAT-12: picking an expense's or income's category: the most used first, then
// every category under its category group, with a search box. Before there is any
// category, it offers the starter set (CAT-04).
export function CategoryPicker({
  open,
  ledger,
  type,
  value,
  onChoose,
  onClose,
}: {
  open: boolean
  ledger: Ledger
  type: 'expense' | 'income'
  value: string | null
  onChoose: (category: Category) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={open}
      title={t('transactions.category')}
      cancelLabel={t('nav.cancel')}
      onClose={onClose}
    >
      {open && <CategoryChoices ledger={ledger} type={type} value={value} onChoose={onChoose} />}
    </Sheet>
  )
}

function CategoryChoices({
  ledger,
  type,
  value,
  onChoose,
}: {
  ledger: Ledger
  type: 'expense' | 'income'
  value: string | null
  onChoose: (category: Category) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  if (ledger.categories.length === 0) return <StarterChoice />

  const groups = new Map(ledger.groups.map((group) => [group.id, group]))
  const pickable = pickableCategories(ledger.categories, ledger.groups, type, value)
  const found = matchingByName(pickable, query)
  const searching = query.trim() !== ''
  const frequent = searching
    ? []
    : frequentCategories(pickable, categoryUsage(ledger.transactions), frequentCount)
  const row = (category: Category, separator?: boolean) => (
    <ChoiceRow
      key={category.id}
      role="radio"
      leading={<CategoryTile category={category} group={groups.get(category.groupId)} />}
      title={category.name}
      checked={category.id === value}
      {...(separator === undefined ? {} : { separator })}
      onToggle={() => {
        onChoose(category)
      }}
    />
  )

  return (
    <>
      <SearchField
        label={t('categories.search')}
        clearLabel={t('pickers.clear')}
        value={query}
        onChange={setQuery}
      />
      {frequent.length > 0 && (
        <List label={t('categories.frequent')} inset>
          {frequent.map((category) => row(category))}
        </List>
      )}
      {searching ? (
        found.length > 0 ? (
          <List inset>{found.map((category) => row(category))}</List>
        ) : (
          <p className="px-4 py-6 text-center text-[0.9375rem] text-text-muted">
            {t('categories.noMatch', { query: query.trim() })}
          </p>
        )
      ) : (
        ledger.groups.map((group) => {
          const inGroup = pickable.filter((category) => category.groupId === group.id)
          if (inGroup.length === 0) return null
          return (
            <List key={group.id} label={group.name} inset>
              {inGroup.map((category) => row(category))}
            </List>
          )
        })
      )}
    </>
  )
}
