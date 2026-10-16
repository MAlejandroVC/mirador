import {
  categoryGroupRecord,
  categoryGroupRecordType,
  categoryRecord,
  categoryRecordType,
} from '@repo/api'
import { type CategoryGroup, nameTaken, reordered } from '@repo/core'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionSheet } from '../../components/ui/action-sheet'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { IconTile } from '../../components/ui/icon-tile'
import { FolderSimpleIcon } from '../../components/ui/icons'
import { List } from '../../components/ui/list'
import { ColorChoices } from '../../components/ui/look-picker'
import { NameField } from '../../components/ui/name-field'
import { ReorderSheet } from '../../components/ui/reorder-sheet'
import { Sheet } from '../../components/ui/sheet'
import { SubmitButton } from '../../components/ui/submit-button'
import { useSubmit } from '../../components/ui/use-submit'
import { useUndo } from '../../components/ui/use-undo'
import { markNew } from '../../lib/motion'
import { type Ledger, newId, recordBody, useSaveRecords } from '../wallets/use-ledger'
import { CategoryTile } from './category-tile'
import { withoutId } from './use-start-categories'

export type GroupSheetMode = { kind: 'new' } | { kind: 'edit'; group: CategoryGroup }

// CAT-01, CAT-14: adding or changing a category group: its name and its color, which
// all its categories show in. Its categories can be put in order from here.
export function GroupSheet({
  open,
  mode,
  ledger,
  onClose,
}: {
  open: boolean
  mode: GroupSheetMode
  ledger: Ledger
  onClose: () => void
}) {
  const { t } = useTranslation()
  const requestCloseRef = useRef<(() => void) | null>(null)
  return (
    <Sheet
      open={open}
      title={mode.kind === 'new' ? t('categories.group.newTitle') : t('categories.group.editTitle')}
      cancelLabel={t('nav.cancel')}
      onClose={() => {
        ;(requestCloseRef.current ?? onClose)()
      }}
    >
      {open && (
        <GroupForm
          mode={mode}
          ledger={ledger}
          requestCloseRef={requestCloseRef}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function GroupForm({
  mode,
  ledger,
  requestCloseRef,
  onClose,
}: {
  mode: GroupSheetMode
  ledger: Ledger
  requestCloseRef: RefObject<(() => void) | null>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const save = useSaveRecords()
  const undo = useUndo()
  const form = useSubmit()
  const initial: Omit<CategoryGroup, 'id'> =
    mode.kind === 'edit' ? withoutId(mode.group) : { name: '', color: 'lake' }
  const [draft, setDraft] = useState(initial)
  const [discarding, setDiscarding] = useState(false)
  const [reordering, setReordering] = useState(false)
  const id = mode.kind === 'edit' ? mode.group.id : null
  const categories = ledger.categories.filter((category) => category.groupId === id)
  const hasSystem = categories.some((category) => category.systemKey !== undefined)
  const name = draft.name.trim()
  // DL-PAT-02, CAT-03: a name no other category group has.
  const nameError =
    name === ''
      ? t('categories.group.nameMissing')
      : nameTaken(
            name,
            ledger.groups.filter((group) => group.id !== id),
          )
        ? t('categories.group.nameTaken')
        : null
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  useEffect(() => {
    requestCloseRef.current = () => {
      if (dirty) setDiscarding(true)
      else onClose()
    }
    return () => {
      requestCloseRef.current = null
    }
  }, [dirty, onClose, requestCloseRef])

  function submit() {
    form.submit(nameError === null, () => {
      const saveId = id ?? newId()
      const record = categoryGroupRecord.parse({
        ...draft,
        name,
        ...(mode.kind === 'new' ? { order: ledger.groups.length } : {}),
      })
      save.mutate([{ id: saveId, body: recordBody(categoryGroupRecordType, record) }], {
        onSuccess: () => {
          markNew(saveId)
          form.finish(onClose)
        },
      })
    })
  }

  // CAT-01: an empty group goes at once, with Undo (DL-PAT-06). One with categories
  // waits until they are moved or deleted, so none is left without a group.
  function remove() {
    if (id === null) return
    const record = categoryGroupRecord.parse(initial)
    save.mutate([{ id, body: { deleted: true, type: categoryGroupRecordType } }], {
      onSuccess: () => {
        onClose()
        undo({
          message: t('categories.deleted', { name: record.name }),
          undo: () => {
            save.mutate([{ id, body: recordBody(categoryGroupRecordType, record) }])
          },
        })
      },
    })
  }

  return (
    <>
      <NameField
        tile={<IconTile icon={FolderSimpleIcon} color={draft.color} size="large" />}
        label={t('categories.group.name')}
        placeholder={t('categories.group.namePlaceholder')}
        value={draft.name}
        maxLength={60}
        error={form.tried ? nameError : null}
        onChange={(value) => {
          setDraft({ ...draft, name: value })
        }}
      />

      <section className="flex flex-col gap-1.5">
        <h3 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
          {t('categories.group.color')}
        </h3>
        <div className="rounded-2xl bg-inset p-2">
          <ColorChoices
            label={t('categories.group.color')}
            value={draft.color}
            colorLabel={(color) => t(`colors.${color}`)}
            onChange={(color) => {
              setDraft({ ...draft, color })
            }}
          />
        </div>
        <p className="px-4 text-[0.8125rem] text-text-muted">{t('categories.group.colorHint')}</p>
      </section>

      {mode.kind === 'edit' && categories.length > 1 && (
        <Button
          variant="secondary"
          onClick={() => {
            setReordering(true)
          }}
        >
          {t('categories.group.reorder')}
        </Button>
      )}

      {/* CAT-07: archived, its categories leave the pickers and stay in history. */}
      {mode.kind === 'edit' && !hasSystem && (
        <List inset>
          <ChoiceRow
            title={t('categories.group.archived')}
            subtitle={t('categories.group.archivedHint')}
            checked={draft.archived ?? false}
            onToggle={() => {
              setDraft({ ...draft, archived: !(draft.archived ?? false) })
            }}
          />
        </List>
      )}

      {mode.kind === 'edit' &&
        (categories.length === 0 ? (
          <Button variant="danger" onClick={remove}>
            {t('categories.group.delete')}
          </Button>
        ) : (
          <p className="px-4 text-center text-[0.8125rem] text-text-muted">
            {t('categories.group.deleteHint')}
          </p>
        ))}

      <SubmitButton
        button={form.button}
        done={form.done}
        pending={save.isPending}
        before={
          save.isError && (
            <p className="px-4 text-[0.8125rem] text-warning">{t('wallets.saveFailed')}</p>
          )
        }
        onClick={submit}
      >
        {t('transactions.save')}
      </SubmitButton>

      <ReorderSheet
        open={reordering}
        title={t('categories.group.reorder')}
        intro={t('categories.group.reorderIntro', { name: initial.name })}
        items={categories.map((category) => ({
          id: category.id,
          name: category.name,
          leading: <CategoryTile category={category} group={draft} />,
        }))}
        pending={save.isPending}
        failed={save.isError}
        onSave={(ids, done) => {
          const byId = new Map(categories.map((category) => [category.id, category]))
          const changes = reordered(ids.flatMap((categoryId) => byId.get(categoryId) ?? [])).map(
            ({ id: categoryId, ...category }) => ({
              id: categoryId,
              body: recordBody(categoryRecordType, categoryRecord.parse(category)),
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

      <ActionSheet
        open={discarding}
        title={t('wallets.form.discardTitle')}
        message={t('categories.group.discard')}
        cancelLabel={t('wallets.form.keepEditing')}
        actions={[{ label: t('wallets.form.discard'), tone: 'danger', onSelect: onClose }]}
        onClose={() => {
          setDiscarding(false)
        }}
      />
    </>
  )
}
