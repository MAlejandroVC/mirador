import type { ImportBatchRecord } from '@repo/api'
import { archiveCounts, type ArchiveResult, restoreChanges, type RestoreMode } from '@repo/archive'
import { useMutation } from '@tanstack/react-query'
import { type SyntheticEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionSheet } from '../../components/ui/action-sheet'
import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { IconTile } from '../../components/ui/icon-tile'
import { FileTextIcon } from '../../components/ui/icons'
import { List, ListButtonRow, ListRow } from '../../components/ui/list'
import { Sheet } from '../../components/ui/sheet'
import { TextField } from '../../components/ui/text-field'
import { formatShortDate, useLocale } from '../../lib/format'
import { useVault } from '../security/hooks/vault'
import { type Ledger, useSaveRecords } from '../wallets/use-ledger'
import { useEraseAll, useUsername } from './use-data'

// The order record types are counted in on the restore sheet.
const countedTypes = [
  'wallet',
  'transaction',
  'recurring',
  'categoryGroup',
  'category',
  'tag',
  'payee',
] as const

/**
 * DAT-04 to DAT-07: restoring a Mirador backup. It is checked first; a file with any
 * problem lists them and changes nothing. Into an account with data the person picks
 * between adding what's missing (the default) and replacing everything.
 */
export function RestoreSheet({
  file,
  ledger,
  onClose,
}: {
  file: { name: string; result: ArchiveResult } | null
  ledger: Ledger
  onClose: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const vault = useVault()
  const save = useSaveRecords()
  const [mode, setMode] = useState<RestoreMode>('merge')
  const [confirming, setConfirming] = useState(false)
  const [added, setAdded] = useState<number | null>(null)
  const hasData = ledger.wallets.length > 0 || ledger.transactions.length > 0
  const today = new Date().toISOString().slice(0, 10)

  const restore = useMutation({
    mutationFn: async () => {
      if (!file?.result.ok) return 0
      const { changes, added: count } = restoreChanges(
        file.result.archive,
        await vault.listRecords(),
        hasData ? mode : 'merge',
      )
      if (changes.length > 0) await save.mutateAsync(changes)
      return count
    },
    onSuccess: setAdded,
  })
  const close = () => {
    setAdded(null)
    setMode('merge')
    restore.reset()
    onClose()
  }

  const result = file?.result
  const counts = result?.ok ? archiveCounts(result.archive) : new Map<string, number>()
  const other = [...counts.entries()]
    .filter(([type]) => !(countedTypes as readonly string[]).includes(type))
    .reduce((sum, [, count]) => sum + count, 0)

  return (
    <Sheet
      open={file !== null}
      title={t('data.restore.title')}
      cancelLabel={t('nav.cancel')}
      onClose={close}
    >
      {file && result && (
        <>
          <List inset>
            <ListRow
              leading={<IconTile icon={FileTextIcon} />}
              title={file.name}
              {...(result.ok
                ? {
                    subtitle: t('data.restore.made', {
                      date: formatShortDate(result.archive.exportedAt.slice(0, 10), today, locale),
                    }),
                  }
                : {})}
            />
          </List>
          {!result.ok && (
            <>
              <Alert>
                {t('data.restore.cannot')} {t('data.restore.nothingChanged')}
              </Alert>
              <List inset label={t('data.restore.problems')}>
                {result.errors.slice(0, 20).map((error, index) => (
                  <ListRow
                    key={`${error.location}-${String(index)}`}
                    title={t(`data.restore.errors.${error.message}`, {
                      defaultValue: t('data.restore.errors.invalid'),
                    })}
                    {...(error.location ? { subtitle: error.location } : {})}
                  />
                ))}
              </List>
            </>
          )}
          {result.ok && added === null && (
            <>
              <List inset label={t('data.restore.contents')}>
                {countedTypes
                  .filter((type) => (counts.get(type) ?? 0) > 0)
                  .map((type) => (
                    <ListRow
                      key={type}
                      title={t(`data.restore.types.${type}`)}
                      trailing={
                        <span className="text-[0.9375rem] text-text-muted tabular-nums">
                          {new Intl.NumberFormat(locale).format(counts.get(type) ?? 0)}
                        </span>
                      }
                    />
                  ))}
                {other > 0 && (
                  <ListRow
                    title={t('data.restore.types.other')}
                    trailing={
                      <span className="text-[0.9375rem] text-text-muted tabular-nums">{other}</span>
                    }
                  />
                )}
              </List>
              {hasData && (
                <List inset label={t('data.restore.hasData')}>
                  <ChoiceRow
                    role="radio"
                    title={t('data.restore.merge')}
                    subtitle={t('data.restore.mergeHint')}
                    checked={mode === 'merge'}
                    onToggle={() => {
                      setMode('merge')
                    }}
                  />
                  <ChoiceRow
                    role="radio"
                    title={t('data.restore.replace')}
                    subtitle={t('data.restore.replaceHint')}
                    checked={mode === 'replace'}
                    onToggle={() => {
                      setMode('replace')
                    }}
                  />
                </List>
              )}
              <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">
                {t('data.restore.note')}
              </p>
              {restore.isError && <Alert>{t('data.restore.failed')}</Alert>}
              <Button
                className="mt-2 w-full"
                disabled={restore.isPending}
                onClick={() => {
                  if (hasData && mode === 'replace') setConfirming(true)
                  else restore.mutate()
                }}
              >
                {restore.isPending ? t('data.working') : t('data.restore.go')}
              </Button>
            </>
          )}
          {added !== null && (
            <>
              <Alert tone="success">{t('data.restore.done', { count: added })}</Alert>
              <Button className="mt-2 w-full" onClick={close}>
                {t('nav.done')}
              </Button>
            </>
          )}
          <ActionSheet
            open={confirming}
            title={t('data.restore.confirmTitle')}
            message={t('data.restore.confirmMessage')}
            cancelLabel={t('nav.cancel')}
            actions={[
              {
                label: t('data.restore.replace'),
                tone: 'danger',
                onSelect: () => {
                  setConfirming(false)
                  restore.mutate()
                },
              },
            ]}
            onClose={() => {
              setConfirming(false)
            }}
          />
        </>
      )}
    </Sheet>
  )
}

export type WaitingRow = ImportBatchRecord['waiting'][number]

/**
 * IMP-34, IMP-35: one import, what it did, and its undo. IMP-33: the rows it left for
 * later, each opening the transaction form filled in with what could be read.
 */
export function BatchSheet({
  batch,
  pending,
  onUndo,
  onFix,
  onClose,
}: {
  batch: (ImportBatchRecord & { id: string }) | null
  pending: boolean
  onUndo: (batchId: string) => void
  onFix: (row: WaitingRow) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [confirming, setConfirming] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const number = (value: number) => new Intl.NumberFormat(locale).format(value)
  const value = (text: string) => (
    <span className="text-[0.9375rem] text-text-muted tabular-nums">{text}</span>
  )
  return (
    <Sheet
      open={batch !== null}
      title={batch ? (batch.source === 'sample' ? t('data.sampleName') : batch.fileName) : ''}
      cancelLabel={t('nav.cancel')}
      onClose={onClose}
    >
      {batch && (
        <>
          <List inset>
            <ListRow
              title={t('data.batch.when')}
              trailing={value(formatShortDate(batch.importedAt.slice(0, 10), today, locale))}
            />
            <ListRow title={t('data.batch.imported')} trailing={value(number(batch.imported))} />
            <ListRow title={t('data.batch.skipped')} trailing={value(number(batch.skipped))} />
          </List>
          {batch.waiting.length > 0 && (
            <>
              <List inset label={t('data.batch.waiting')}>
                {batch.waiting.slice(0, 50).map((row) => (
                  <ListButtonRow
                    key={row.line}
                    tone="text"
                    title={t('data.review.row', { line: number(row.line) })}
                    subtitle={`${t(`data.problems.${row.problem}`)}${row.text ? ` · ${row.text}` : ''}`}
                    trailing={
                      <span className="text-[0.9375rem] text-brand">{t('data.batch.fix')}</span>
                    }
                    onClick={() => {
                      onFix(row)
                    }}
                  />
                ))}
              </List>
              <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">
                {t('data.batch.waitingNote')}
              </p>
            </>
          )}
          <Button
            variant="danger"
            className="mt-2 w-full"
            disabled={pending}
            onClick={() => {
              setConfirming(true)
            }}
          >
            {pending ? t('data.working') : t('data.done.undo')}
          </Button>
          <ActionSheet
            open={confirming}
            title={t('data.batch.confirmTitle')}
            message={t('data.batch.confirmMessage', { count: batch.imported })}
            cancelLabel={t('nav.cancel')}
            actions={[
              {
                label: t('data.done.undo'),
                tone: 'danger',
                onSelect: () => {
                  setConfirming(false)
                  onUndo(batch.id)
                },
              },
            ]}
            onClose={() => {
              setConfirming(false)
            }}
          />
        </>
      )}
    </Sheet>
  )
}

/** DAT-11: erasing everything takes the account's username, typed. */
export function EraseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const username = useUsername()
  const erase = useEraseAll()
  const [typed, setTyped] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const close = () => {
    setTyped('')
    setMismatch(false)
    erase.reset()
    onClose()
  }
  const submit = (event: SyntheticEvent) => {
    event.preventDefault()
    const matches = typed.trim().toLowerCase() === username.toLowerCase()
    setMismatch(!matches)
    if (matches) erase.mutate()
  }
  return (
    <Sheet open={open} title={t('data.erase.title')} cancelLabel={t('nav.cancel')} onClose={close}>
      {erase.isSuccess ? (
        <>
          <Alert tone="success">{t('data.erase.done')}</Alert>
          <Button className="mt-2 w-full" onClick={close}>
            {t('nav.done')}
          </Button>
        </>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <p className="text-[0.9375rem] text-text-muted">{t('data.erase.message')}</p>
          <TextField
            label={t('data.erase.label', { username })}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            error={mismatch ? t('security.errors.usernameMismatch') : undefined}
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value)
            }}
          />
          {erase.isError && <Alert>{t('data.erase.failed')}</Alert>}
          <Button type="submit" variant="danger" disabled={erase.isPending}>
            {erase.isPending ? t('data.working') : t('data.erase.title')}
          </Button>
        </form>
      )}
    </Sheet>
  )
}
