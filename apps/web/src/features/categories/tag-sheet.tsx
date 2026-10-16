import { tagRecord, tagRecordType } from '@repo/api'
import { nameTaken, nextTagColor, type Tag } from '@repo/core'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionSheet } from '../../components/ui/action-sheet'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { IconTile } from '../../components/ui/icon-tile'
import { TagIcon } from '../../components/ui/icons'
import { List } from '../../components/ui/list'
import { ColorChoices } from '../../components/ui/look-picker'
import { NameField } from '../../components/ui/name-field'
import { Sheet } from '../../components/ui/sheet'
import { SubmitButton } from '../../components/ui/submit-button'
import { useSubmit } from '../../components/ui/use-submit'
import { markNew } from '../../lib/motion'
import {
  type Ledger,
  newId,
  type RecordChange,
  recordBody,
  transactionBody,
  useSaveRecords,
} from '../wallets/use-ledger'
import { withoutId } from './use-start-categories'

export type TagSheetMode = { kind: 'new' } | { kind: 'edit'; tag: Tag }

// CAT-21, CAT-25: adding or changing a tag: its name and color. Deleting one in use
// first says how many transactions lose it (CAT-22).
export function TagSheet({
  open,
  mode,
  ledger,
  onClose,
}: {
  open: boolean
  mode: TagSheetMode
  ledger: Ledger
  onClose: () => void
}) {
  const { t } = useTranslation()
  const requestCloseRef = useRef<(() => void) | null>(null)
  return (
    <Sheet
      open={open}
      title={mode.kind === 'new' ? t('tags.form.newTitle') : t('tags.form.editTitle')}
      cancelLabel={t('nav.cancel')}
      onClose={() => {
        ;(requestCloseRef.current ?? onClose)()
      }}
    >
      {open && (
        <TagForm mode={mode} ledger={ledger} requestCloseRef={requestCloseRef} onClose={onClose} />
      )}
    </Sheet>
  )
}

function TagForm({
  mode,
  ledger,
  requestCloseRef,
  onClose,
}: {
  mode: TagSheetMode
  ledger: Ledger
  requestCloseRef: RefObject<(() => void) | null>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const save = useSaveRecords()
  const form = useSubmit()
  const initial: Omit<Tag, 'id'> =
    mode.kind === 'edit' ? withoutId(mode.tag) : { name: '', color: nextTagColor(ledger.tags) }
  const [draft, setDraft] = useState(initial)
  const [discarding, setDiscarding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const id = mode.kind === 'edit' ? mode.tag.id : null
  const tagged = ledger.transactions.filter(
    (transaction) => id !== null && (transaction.tagIds ?? []).includes(id),
  )
  const name = draft.name.trim()
  const nameError =
    name === ''
      ? t('tags.form.nameMissing')
      : nameTaken(
            name,
            ledger.tags.filter((tag) => tag.id !== id),
          )
        ? t('tags.form.nameTaken')
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
      save.mutate(
        [{ id: saveId, body: recordBody(tagRecordType, tagRecord.parse({ ...draft, name })) }],
        {
          onSuccess: () => {
            markNew(saveId)
            form.finish(onClose)
          },
        },
      )
    })
  }

  // CAT-22: the tag comes off every transaction that has it, in the same batch.
  function remove() {
    if (id === null) return
    const changes: RecordChange[] = [
      ...tagged.map(({ id: transactionId, ...transaction }) => {
        const tagIds = (transaction.tagIds ?? []).filter((tagId) => tagId !== id)
        const record: typeof transaction = { ...transaction, tagIds }
        if (tagIds.length === 0) delete record.tagIds
        return { id: transactionId, body: transactionBody(record) }
      }),
      { id, body: { deleted: true, type: tagRecordType } },
    ]
    save.mutate(changes, { onSuccess: onClose })
  }

  return (
    <>
      <NameField
        tile={<IconTile icon={TagIcon} color={draft.color} size="large" />}
        label={t('tags.form.name')}
        placeholder={t('tags.form.namePlaceholder')}
        value={draft.name}
        maxLength={40}
        error={form.tried ? nameError : null}
        onChange={(value) => {
          setDraft({ ...draft, name: value })
        }}
      />

      <section className="flex flex-col gap-1.5">
        <h3 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
          {t('tags.form.color')}
        </h3>
        <div className="rounded-2xl bg-inset p-2">
          <ColorChoices
            label={t('tags.form.color')}
            value={draft.color}
            colorLabel={(color) => t(`colors.${color}`)}
            onChange={(color) => {
              setDraft({ ...draft, color })
            }}
          />
        </div>
      </section>

      {mode.kind === 'edit' && (
        <List inset>
          <ChoiceRow
            title={t('tags.form.archived')}
            subtitle={t('tags.form.archivedHint')}
            checked={draft.archived ?? false}
            onToggle={() => {
              setDraft({ ...draft, archived: !(draft.archived ?? false) })
            }}
          />
        </List>
      )}

      {mode.kind === 'edit' && (
        <Button
          variant="danger"
          onClick={() => {
            if (tagged.length > 0) setDeleting(true)
            else remove()
          }}
        >
          {t('tags.form.delete')}
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

      <ActionSheet
        open={deleting}
        title={t('tags.form.deleteTitle', { name: initial.name })}
        message={t('tags.form.deleteInUse', { count: tagged.length })}
        cancelLabel={t('nav.cancel')}
        actions={[
          {
            label: t('tags.form.delete'),
            tone: 'danger',
            onSelect: () => {
              setDeleting(false)
              remove()
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
        message={t('tags.form.discard')}
        cancelLabel={t('wallets.form.keepEditing')}
        actions={[{ label: t('wallets.form.discard'), tone: 'danger', onSelect: onClose }]}
        onClose={() => {
          setDiscarding(false)
        }}
      />
    </>
  )
}
