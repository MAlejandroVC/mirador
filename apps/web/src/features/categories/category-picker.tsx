import {
  type Category,
  categoryUsage,
  frequentCategories,
  matchingByName,
  pickableCategories,
} from '@repo/core'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChoiceRow } from '../../components/ui/choice-row'
import { List, ListButtonRow } from '../../components/ui/list'
import { SearchField } from '../../components/ui/search-field'
import { Sheet } from '../../components/ui/sheet'
import type { Ledger } from '../wallets/use-ledger'
import { CategoryTile } from './category-tile'

// How many of the most used categories lead the picker (CAT-12).
const frequentCount = 6

// CAT-02, CAT-12: picking an expense's or income's category: the most used first, then
// every category under its category group, with a search box. TXN-11: money in can be
// a refund instead, which takes the expense category of what was refunded.
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
  const top = useRef<HTMLDivElement>(null)
  // TXN-11: an income already refunding an expense category opens on those.
  const [refunding, setRefunding] = useState(
    type === 'income' &&
      ledger.categories.some((category) => category.id === value && category.kind === 'expense'),
  )
  // CAT-04: the suggested set is being added (useSeedCategories); it takes a moment.
  if (ledger.categories.length === 0) return null

  // The switch sits at the end of the list; the other list starts from its top.
  const switchTo = (next: boolean) => {
    setRefunding(next)
    requestAnimationFrame(() => {
      // The sheet scrolls under its sticky bar, so scroll that container back to 0.
      for (let node = top.current?.parentElement; node; node = node.parentElement)
        if (node.scrollTop > 0) node.scrollTop = 0
    })
  }

  const groups = new Map(ledger.groups.map((group) => [group.id, group]))
  const pickable = refunding
    ? pickableCategories(ledger.categories, ledger.groups, 'expense', value).filter(
        (category) => category.kind === 'expense',
      )
    : pickableCategories(ledger.categories, ledger.groups, type, value)
  const found = matchingByName(pickable, query)
  const searching = query.trim() !== ''
  const frequent =
    searching || refunding
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
      <div ref={top} hidden />
      <SearchField
        label={t('categories.search')}
        clearLabel={t('pickers.clear')}
        value={query}
        onChange={setQuery}
      />
      {refunding && (
        <List inset>
          <ListButtonRow
            title={t('categories.refund.back')}
            onClick={() => {
              switchTo(false)
            }}
          />
        </List>
      )}
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
            <List
              key={group.id}
              label={refunding ? t('categories.refund.in', { group: group.name }) : group.name}
              inset
            >
              {inGroup.map((category) => row(category))}
            </List>
          )
        })
      )}
      {type === 'income' && !refunding && !searching && (
        <section className="flex flex-col gap-1.5">
          <List inset>
            <ListButtonRow
              title={t('categories.refund.action')}
              onClick={() => {
                switchTo(true)
              }}
            />
          </List>
          {/* DL-CMP-09: the hint sits under the control it explains. */}
          <p className="px-4 text-[0.8125rem] text-text-muted">{t('categories.refund.hint')}</p>
        </section>
      )}
    </>
  )
}
