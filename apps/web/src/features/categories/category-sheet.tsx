import {
  categoryIcons,
  categoryRecord,
  categoryRecordType,
  type CategoryIcon,
  type Flexibility,
} from '@repo/api'
import { type Category, categoryUsage, nameTaken, pickableCategories } from '@repo/core'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionSheet } from '../../components/ui/action-sheet'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { FieldNote, FieldRows } from '../../components/ui/field-row'
import { IconChoices } from '../../components/ui/look-picker'
import { List } from '../../components/ui/list'
import { NameField } from '../../components/ui/name-field'
import { PickerRow } from '../../components/ui/picker-row'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet } from '../../components/ui/sheet'
import { SubmitButton } from '../../components/ui/submit-button'
import { useSubmit } from '../../components/ui/use-submit'
import { useUndo } from '../../components/ui/use-undo'
import { markNew } from '../../lib/motion'
import {
  type Ledger,
  newId,
  type RecordChange,
  recordBody,
  transactionBody,
  useSaveRecords,
} from '../wallets/use-ledger'
import { CategoryPicker } from './category-picker'
import { CategoryTile, TagDot } from './category-tile'
import { categoryIconComponents } from './category-icons'
import { withoutId } from './use-start-categories'

export type CategorySheetMode =
  { kind: 'new'; groupId: string | null } | { kind: 'edit'; category: Category }

// CAT-01, CAT-02: adding or changing a category: its name, category group, kind,
// flexibility, icon and an optional description. Its color is its group's (CAT-14).
export function CategorySheet({
  open,
  mode,
  ledger,
  onClose,
}: {
  open: boolean
  mode: CategorySheetMode
  ledger: Ledger
  onClose: () => void
}) {
  const { t } = useTranslation()
  const requestCloseRef = useRef<(() => void) | null>(null)
  return (
    <Sheet
      open={open}
      title={mode.kind === 'new' ? t('categories.form.newTitle') : t('categories.form.editTitle')}
      cancelLabel={t('nav.cancel')}
      onClose={() => {
        ;(requestCloseRef.current ?? onClose)()
      }}
    >
      {open && (
        <CategoryForm
          mode={mode}
          ledger={ledger}
          requestCloseRef={requestCloseRef}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function CategoryForm({
  mode,
  ledger,
  requestCloseRef,
  onClose,
}: {
  mode: CategorySheetMode
  ledger: Ledger
  requestCloseRef: RefObject<(() => void) | null>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const save = useSaveRecords()
  const undo = useUndo()
  const form = useSubmit()
  const pickableGroups = ledger.groups.filter(
    (group) => !group.archived || (mode.kind === 'edit' && group.id === mode.category.groupId),
  )
  const initial: Omit<Category, 'id'> =
    mode.kind === 'edit'
      ? withoutId(mode.category)
      : {
          name: '',
          groupId: mode.groupId ?? pickableGroups[0]?.id ?? '',
          kind: 'expense',
          icon: 'shoppingBag',
          flexibility: 'flexible',
        }
  const [draft, setDraft] = useState(initial)
  const [choosingGroup, setChoosingGroup] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [moving, setMoving] = useState(false)
  const group = ledger.groups.find((item) => item.id === draft.groupId)
  const system = draft.systemKey !== undefined
  const id = mode.kind === 'edit' ? mode.category.id : null
  const siblings = ledger.categories.filter(
    (category) => category.groupId === draft.groupId && category.id !== id,
  )
  const used = id === null ? 0 : (categoryUsage(ledger.transactions).get(id) ?? 0)

  // DL-PAT-02, CAT-03: a name, unique in its category group, and a group.
  const name = draft.name.trim()
  const nameError =
    name === ''
      ? t('categories.form.nameMissing')
      : nameTaken(name, siblings)
        ? t('categories.form.nameTaken', { group: group?.name ?? '' })
        : null
  const groupError = group ? null : t('categories.form.groupMissing')
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
    form.submit(nameError === null && groupError === null, () => {
      const saveId = id ?? newId()
      const { description, ...rest } = draft
      const text = description?.trim()
      const record = categoryRecord.parse({
        ...rest,
        name,
        ...(text ? { description: text } : {}),
        // A new one goes at the end of its group (CAT-01).
        ...(mode.kind === 'new' ? { order: siblings.length } : {}),
      })
      save.mutate([{ id: saveId, body: recordBody(categoryRecordType, record) }], {
        onSuccess: () => {
          markNew(saveId)
          form.finish(onClose)
        },
      })
    })
  }

  // CAT-06: one in use is moved or archived; one not in use goes at once, with Undo
  // (DL-PAT-06).
  function remove(moveTo?: Category) {
    if (mode.kind !== 'edit') return
    const { id: categoryId, ...record } = mode.category
    const moved = ledger.transactions.filter((transaction) => transaction.categoryId === categoryId)
    const changes: RecordChange[] = [
      ...(moveTo
        ? moved.map(({ id: transactionId, ...transaction }) => ({
            id: transactionId,
            body: transactionBody({ ...transaction, categoryId: moveTo.id }),
          }))
        : []),
      { id: categoryId, body: { deleted: true, type: categoryRecordType } },
    ]
    save.mutate(changes, {
      onSuccess: () => {
        onClose()
        if (moveTo) return
        undo({
          message: t('categories.deleted', { name: record.name }),
          undo: () => {
            save.mutate([
              {
                id: categoryId,
                body: recordBody(categoryRecordType, categoryRecord.parse(record)),
              },
            ])
          },
        })
      },
    })
  }

  const flexibilities: Flexibility[] = ['locked', 'fixed', 'flexible']

  return (
    <>
      <NameField
        tile={<CategoryTile category={draft} group={group} size="large" />}
        label={t('categories.form.name')}
        placeholder={t('categories.form.namePlaceholder')}
        value={draft.name}
        maxLength={60}
        error={form.tried ? nameError : null}
        onChange={(value) => {
          setDraft({ ...draft, name: value })
        }}
      />

      <FieldRows note={form.tried && groupError ? <FieldNote error>{groupError}</FieldNote> : null}>
        <PickerRow
          label={t('categories.form.group')}
          value={group?.name ?? t('pickers.choose')}
          valueLeading={group && <TagDot color={group.color} />}
          error={form.tried && groupError !== null}
          onClick={() => {
            setChoosingGroup(true)
          }}
        />
      </FieldRows>

      {/* CAT-02: money out or money in; system categories that take both keep it. */}
      {!system && (
        <SegmentedControl
          label={t('categories.form.kind')}
          options={[
            { value: 'expense', label: t('transactions.types.expense') },
            { value: 'income', label: t('transactions.types.income') },
          ]}
          value={draft.kind === 'income' ? 'income' : 'expense'}
          onChange={(kind) => {
            setDraft({ ...draft, kind })
          }}
        />
      )}

      {/* CAT-02, BUD: how the budget may treat it; the hint explains the choice. */}
      {draft.kind !== 'income' && (
        <section className="flex flex-col gap-1.5">
          <h3 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
            {t('categories.form.flexibility')}
          </h3>
          <SegmentedControl
            label={t('categories.form.flexibility')}
            options={flexibilities.map((value) => ({
              value,
              label: t(`categories.flexibility.${value}`),
            }))}
            value={draft.flexibility}
            onChange={(flexibility) => {
              setDraft({ ...draft, flexibility })
            }}
          />
          <p className="px-4 text-[0.8125rem] text-text-muted">
            {t(`categories.flexibility.${draft.flexibility}Hint`)}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <h3 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
          {t('categories.form.icon')}
        </h3>
        <div className="rounded-2xl bg-inset p-2">
          <IconChoices
            label={t('categories.form.icon')}
            icons={categoryIcons}
            components={categoryIconComponents}
            value={draft.icon as CategoryIcon}
            color={group?.color ?? 'stone'}
            iconLabel={(icon) => t(`categories.icons.${icon}`)}
            onChange={(icon) => {
              setDraft({ ...draft, icon })
            }}
          />
        </div>
        <p className="px-4 text-[0.8125rem] text-text-muted">{t('categories.form.colorHint')}</p>
      </section>

      <label className="flex flex-col">
        <span className="sr-only">{t('categories.form.description')}</span>
        <textarea
          value={draft.description ?? ''}
          onChange={(event) => {
            setDraft({ ...draft, description: event.target.value })
          }}
          maxLength={200}
          rows={2}
          placeholder={t('categories.form.descriptionPlaceholder')}
          className="min-h-[3.25rem] resize-none rounded-2xl bg-inset px-4 py-3.5 text-[0.9375rem] text-text caret-brand placeholder:text-text-muted focus:outline-none"
        />
      </label>

      {/* CAT-07: archived, it leaves the pickers and stays in history. CAT-05: system
          categories can be renamed, never put away. */}
      {mode.kind === 'edit' && !system && (
        <List inset>
          <ChoiceRow
            role="switch"
            title={t('categories.form.archived')}
            subtitle={t('categories.form.archivedHint')}
            checked={draft.archived ?? false}
            onToggle={() => {
              setDraft({ ...draft, archived: !(draft.archived ?? false) })
            }}
          />
        </List>
      )}

      {mode.kind === 'edit' && !system && (
        <Button
          variant="danger"
          onClick={() => {
            if (used > 0) setDeleting(true)
            else remove()
          }}
        >
          {t('categories.form.delete')}
        </Button>
      )}

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

      <Sheet
        open={choosingGroup}
        title={t('categories.form.group')}
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          setChoosingGroup(false)
        }}
      >
        <List inset>
          {pickableGroups.map((item) => (
            <ChoiceRow
              key={item.id}
              role="radio"
              leading={<TagDot color={item.color} />}
              title={item.name}
              checked={item.id === draft.groupId}
              onToggle={() => {
                setDraft({ ...draft, groupId: item.id })
                setChoosingGroup(false)
              }}
            />
          ))}
        </List>
      </Sheet>

      <CategoryPicker
        open={moving}
        ledger={{
          ...ledger,
          categories: pickableCategories(
            ledger.categories,
            ledger.groups,
            draft.kind === 'income' ? 'income' : 'expense',
          ).filter((category) => category.id !== id),
        }}
        type={draft.kind === 'income' ? 'income' : 'expense'}
        value={null}
        onChoose={(target) => {
          setMoving(false)
          remove(target)
        }}
        onClose={() => {
          setMoving(false)
        }}
      />

      <ActionSheet
        open={deleting}
        title={t('categories.form.deleteTitle', { name: initial.name })}
        message={t('categories.form.deleteInUse', { count: used })}
        cancelLabel={t('nav.cancel')}
        actions={[
          {
            label: t('categories.form.moveAndDelete'),
            onSelect: () => {
              setDeleting(false)
              setMoving(true)
            },
          },
          {
            label: t('categories.form.archiveInstead'),
            onSelect: () => {
              setDeleting(false)
              if (id === null) return
              save.mutate(
                [
                  {
                    id,
                    body: recordBody(
                      categoryRecordType,
                      categoryRecord.parse({ ...initial, archived: true }),
                    ),
                  },
                ],
                { onSuccess: onClose },
              )
            },
          },
        ]}
        onClose={() => {
          setDeleting(false)
        }}
      />

      <ActionSheet
        open={discarding}
        title={t('wallets.form.discardTitle')}
        message={t('categories.form.discard')}
        cancelLabel={t('wallets.form.keepEditing')}
        actions={[{ label: t('wallets.form.discard'), tone: 'danger', onSelect: onClose }]}
        onClose={() => {
          setDiscarding(false)
        }}
      />
    </>
  )
}
