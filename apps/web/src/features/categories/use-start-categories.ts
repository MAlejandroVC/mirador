import {
  categoryGroupRecord,
  categoryGroupRecordType,
  categoryRecord,
  categoryRecordType,
  tagRecord,
  tagRecordType,
} from '@repo/api'
import { starterSet } from '@repo/core'
import { useTranslation } from 'react-i18next'
import { newId, type RecordChange, recordBody, useSaveRecords } from '../wallets/use-ledger'

/** A record's change without its id inside, ready to save. */
export function withoutId<T extends { id: string }>(item: T): Omit<T, 'id'> {
  const rest: Partial<T> = { ...item }
  delete rest.id
  return rest as Omit<T, 'id'>
}

/**
 * CAT-04, CAT-05: sets up categories the first time: the suggested set, in the
 * person's language, or only the system categories to build their own from scratch.
 * Everything is saved in one batch, encrypted (SEC-01).
 */
export function useStartCategories() {
  const { t } = useTranslation()
  const save = useSaveRecords()
  return {
    pending: save.isPending,
    failed: save.isError,
    start: (systemOnly: boolean, onDone?: () => void) => {
      const set = starterSet(
        {
          group: (key) => t(`starter.groups.${key}`),
          category: (key) => t(`starter.categories.${key}`),
          tag: (key) => t(`starter.tags.${key}`),
        },
        newId,
        { systemOnly },
      )
      const changes: RecordChange[] = [
        ...set.groups.map((group) => ({
          id: group.id,
          body: recordBody(categoryGroupRecordType, categoryGroupRecord.parse(withoutId(group))),
        })),
        ...set.categories.map((category) => ({
          id: category.id,
          body: recordBody(categoryRecordType, categoryRecord.parse(withoutId(category))),
        })),
        ...set.tags.map((tag) => ({
          id: tag.id,
          body: recordBody(tagRecordType, tagRecord.parse(withoutId(tag))),
        })),
      ]
      save.mutate(changes, { onSuccess: () => onDone?.() })
    },
  }
}
