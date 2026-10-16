import type { TransactionSort } from '@repo/core'
import { useTranslation } from 'react-i18next'
import { ChoiceRow } from '../../components/ui/choice-row'
import { List } from '../../components/ui/list'
import { Sheet } from '../../components/ui/sheet'

const sorts: readonly TransactionSort[] = [
  'newest',
  'oldest',
  'largest',
  'smallest',
  'category',
  'group',
  'wallet',
]

// TXN-21: how the list is ordered. Newest first is the default and keeps the days.
export function SortSheet({
  open,
  value,
  onChange,
  onClose,
}: {
  open: boolean
  value: TransactionSort
  onChange: (sort: TransactionSort) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} title={t('sort.title')} doneLabel={t('nav.done')} onClose={onClose}>
      <List inset>
        {sorts.map((sort) => (
          <ChoiceRow
            key={sort}
            role="radio"
            title={t(`sort.${sort}`)}
            checked={value === sort}
            onToggle={() => {
              onChange(sort)
              onClose()
            }}
          />
        ))}
      </List>
    </Sheet>
  )
}
