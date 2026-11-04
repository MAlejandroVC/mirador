import { readArchive, type ArchiveResult } from '@repo/archive'
import { fileFingerprint } from '@repo/crypto'
import { parseCsv } from '@repo/import'
import { useNavigate } from '@tanstack/react-router'
import { type RefObject, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionSheet } from '../../components/ui/action-sheet'
import { useUndo } from '../../components/ui/use-undo'
import { formatShortDate, useLocale } from '../../lib/format'
import { markNew } from '../../lib/motion'
import { useQuickAdd } from '../quick-add/use-quick-add'
import type { Ledger } from '../wallets/use-ledger'
import { RestoreSheet } from './data-sheets'
import type { ImportFile } from './import-model'
import { ImportSheet } from './import-sheet'
import { isPdf, isPicture } from './reading'
import { useUndoImport } from './use-data'

// IMP-01 to IMP-05, DAT-04: what happens to the files the person picks, wherever they
// pick them (Settings › Your data, or "Review again" under Imports). PDFs and pictures
// are a statement, a Mirador backup is restored, anything else is read as a CSV. Every
// file is read here on the device; the server never sees one (IMP-11, SEC-01).

export type ImporterMessage =
  { kind: 'unreadable' } | { kind: 'mixed' } | { kind: 'undone'; count: number }

export function Importer({
  ledger,
  input,
  again = true,
  onMessage,
}: {
  ledger: Ledger
  input: RefObject<HTMLInputElement | null>
  /** IMP-36: warn about a file imported before; "Review again" means to. */
  again?: boolean
  onMessage: (message: ImporterMessage | null) => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const quickAdd = useQuickAdd()
  const undoBanner = useUndo()
  const undo = useUndoImport()
  const [csv, setCsv] = useState<ImportFile | null>(null)
  // IMP-04, IMP-05: PDFs and pictures, read in the import sheet before its steps.
  const [reading, setReading] = useState<{ files: File[]; fingerprint: string } | null>(null)
  const [seen, setSeen] = useState<{ go: () => void; date: string } | null>(null)
  const [archive, setArchive] = useState<{ name: string; result: ArchiveResult } | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  // IMP-36: the same file again is worth a word before it is read.
  const unlessSeen = (fingerprint: string, go: () => void) => {
    const before = again && ledger.batches.find((batch) => batch.fingerprint === fingerprint)
    if (before)
      setSeen({ go, date: formatShortDate(before.importedAt.slice(0, 10), today, locale) })
    else go()
  }
  const open = async (picked: File[]) => {
    onMessage(null)
    const [first] = picked
    if (!first) return
    if (picked.every((file) => isPdf(file) || isPicture(file))) {
      const hashes = await Promise.all(
        picked.map(async (file) => fileFingerprint(await file.arrayBuffer())),
      )
      const fingerprint =
        hashes.length === 1 && hashes[0]
          ? hashes[0]
          : await fileFingerprint(new TextEncoder().encode(hashes.join(',')))
      unlessSeen(fingerprint, () => {
        setReading({ files: picked, fingerprint })
      })
      return
    }
    if (picked.length > 1) {
      onMessage({ kind: 'mixed' })
      return
    }
    const bytes = await first.arrayBuffer()
    const text = new TextDecoder().decode(bytes)
    if (/^\s*\{/.test(text)) {
      setArchive({ name: first.name, result: readArchive(text) })
      return
    }
    const table = parseCsv(text)
    if (table.header.length < 2 || table.rows.length === 0) {
      onMessage({ kind: 'unreadable' })
      return
    }
    const file = { name: first.name, fingerprint: await fileFingerprint(bytes), table }
    unlessSeen(file.fingerprint, () => {
      setCsv(file)
    })
  }
  const undoBatch = (id: string) => {
    undo.mutate(
      { batchId: id, ledger },
      {
        onSuccess: (removed) => {
          onMessage({ kind: 'undone', count: removed })
          setCsv(null)
        },
      },
    )
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,.tsv,.txt,.json,.pdf,text/csv,application/json,text/plain,application/pdf,image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          const picked = [...(event.target.files ?? [])]
          event.target.value = ''
          void open(picked)
        }}
      />
      <ImportSheet
        file={csv}
        reading={reading}
        ledger={ledger}
        onRead={(file) => {
          setReading(null)
          setCsv(file)
        }}
        onClose={() => {
          setCsv(null)
          setReading(null)
        }}
        onUndo={undoBatch}
        onReceipt={(file) => {
          quickAdd.openWith(file)
        }}
        onImported={(done) => {
          setCsv(null)
          setReading(null)
          // IMP-40: the wallet shows what came in, each new row highlighted (DL-MOT-02).
          for (const id of done.transactionIds) markNew(id)
          if (done.walletId)
            void navigate({ to: '/wallets/$walletId', params: { walletId: done.walletId } })
          // IMP-42: undoing asks what to undo, under Imports, where it can be undone later.
          undoBanner({
            message: t('data.statement.imported', { count: done.imported }),
            seconds: 10,
            undo: () => {
              void navigate({
                to: '/settings/imports',
                search: { batch: done.batchId, undo: true },
              })
            },
          })
        }}
      />
      <ActionSheet
        open={seen !== null}
        title={t('data.again.title')}
        message={t('data.again.message', { date: seen?.date ?? '' })}
        cancelLabel={t('nav.cancel')}
        actions={[
          {
            label: t('data.again.go'),
            onSelect: () => {
              seen?.go()
              setSeen(null)
            },
          },
        ]}
        onClose={() => {
          setSeen(null)
        }}
      />
      <RestoreSheet
        file={archive}
        ledger={ledger}
        onClose={() => {
          setArchive(null)
        }}
      />
    </>
  )
}
