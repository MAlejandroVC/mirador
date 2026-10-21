import { readArchive, type ArchiveResult } from '@repo/archive'
import { fractionDigits } from '@repo/core'
import { fileFingerprint } from '@repo/crypto'
import {
  defaultDecisions,
  linkCategories,
  linkWallets,
  parseCsv,
  planRows,
  sampleBalances,
  sampleRows,
  type WalletLink,
  type WalletPreset,
} from '@repo/import'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { ActionSheet } from '../../components/ui/action-sheet'
import { Alert } from '../../components/ui/alert'
import { IconTile } from '../../components/ui/icon-tile'
import {
  DatabaseIcon,
  DownloadSimpleIcon,
  FlaskIcon,
  TableIcon,
  UploadSimpleIcon,
} from '../../components/ui/icons'
import { List, ListButtonRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { Sheet } from '../../components/ui/sheet'
import { formatShortDate, useLocale } from '../../lib/format'
import { EntrySheet } from '../transactions/entry-sheet'
import { newId, useLedger, useSaveRecords } from '../wallets/use-ledger'
import { BatchSheet, EraseSheet, RestoreSheet, type WaitingRow } from './data-sheets'
import { buildChanges, currencyOf, type ImportFile } from './import-model'
import { isPdf, isPicture } from './reading'
import { DoneStep, type ImportDone, ImportSheet } from './import-sheet'
import { downloadSpreadsheet, useDownloadBackup, useUndoImport } from './use-data'

// Settings > Your data (Epic 9): take everything out as a Mirador backup (DAT-01) or a
// spreadsheet (DAT-02), bring a backup back (DAT-04, DAT-05) or a CSV in (IMP-02,
// DAT-12), see every import and undo any of them (IMP-34, IMP-35), and erase everything
// (DAT-11). Files are made and read on this device; the server never sees them (SEC-01).
export function DataScreen() {
  const { t } = useTranslation()
  const back = useBack()
  const locale = useLocale()
  const { data: ledger } = useLedger()
  const backup = useDownloadBackup()
  const undo = useUndoImport()
  const save = useSaveRecords()
  const input = useRef<HTMLInputElement>(null)
  const [csv, setCsv] = useState<ImportFile | null>(null)
  // IMP-04, IMP-05: PDFs and pictures, read in the import sheet before its steps.
  const [reading, setReading] = useState<{ files: File[]; fingerprint: string } | null>(null)
  const [again, setAgain] = useState<{ go: () => void; date: string } | null>(null)
  const [archive, setArchive] = useState<{ name: string; result: ArchiveResult } | null>(null)
  const [batchId, setBatchId] = useState<string | null>(null)
  // IMP-33: a row an import left for later, opened in the transaction form.
  const [fixing, setFixing] = useState<{ batchId: string; row: WaitingRow } | null>(null)
  const [erasing, setErasing] = useState(false)
  const [unreadable, setUnreadable] = useState<'file' | 'mixed' | null>(null)
  const [sampleDone, setSampleDone] = useState<ImportDone | null>(null)
  const [undone, setUndone] = useState<number | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  // IMP-36: the same file again is worth a word before it is read.
  const unlessSeen = (fingerprint: string, go: () => void) => {
    const before = ledger?.batches.find((batch) => batch.fingerprint === fingerprint)
    if (before)
      setAgain({ go, date: formatShortDate(before.importedAt.slice(0, 10), today, locale) })
    else go()
  }

  // PDFs and pictures are statements, any number at once (IMP-01, IMP-04, IMP-05);
  // Mirador backups are JSON; anything else is read as a CSV (IMP-02).
  const open = async (picked: File[]) => {
    setUnreadable(null)
    setUndone(null)
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
      setUnreadable('mixed')
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
      setUnreadable('file')
      return
    }
    const file = { name: first.name, fingerprint: await fileFingerprint(bytes), table }
    unlessSeen(file.fingerprint, () => {
      setCsv(file)
    })
  }

  const addSample = () => {
    if (!ledger) return
    const names = {
      wallet: (key: 'checking' | 'cash' | 'creditCard' | 'savings') => t(`wallets.presets.${key}`),
      group: (key: string) => t(`starter.groups.${key}`),
      category: (key: string) => t(`starter.categories.${key}`),
      tag: (key: string) => t(`starter.tags.${key}`),
    }
    const rows = sampleRows(today, names, ledger.defaultCurrency)
    const wallets = linkWallets(rows, { ...ledger, wallets: [] }, null, ledger.defaultCurrency).map(
      (link): WalletLink => {
        const key = (Object.keys(sampleBalances) as (keyof typeof sampleBalances)[]).find(
          (k) => names.wallet(k) === link.name,
        )
        const preset: WalletPreset = key ?? 'generic'
        const scale = 10 ** fractionDigits(ledger.defaultCurrency)
        return {
          ...link,
          target: {
            kind: 'new' as const,
            name: link.name,
            preset,
            currency: ledger.defaultCurrency,
            balanceToday: key ? sampleBalances[key] * scale : null,
          },
        }
      },
    )
    const categories = linkCategories(rows, ledger)
    const planned = planRows(rows, ledger, wallets, (link) => currencyOf(link, ledger))
    const {
      changes,
      batch,
      batchId: id,
    } = buildChanges({
      planned,
      wallets,
      categories,
      decisions: defaultDecisions(planned),
      ledger,
      file: { name: t('data.sampleName'), source: 'sample' },
      names: { wallet: t('data.match.importedName'), group: t('data.match.importedName') },
      newId,
    })
    save.mutate(changes, {
      onSuccess: () => {
        setSampleDone({
          batchId: id,
          imported: batch.imported,
          skipped: 0,
          merged: 0,
          waiting: 0,
          wallets: wallets.length,
        })
      },
    })
  }

  const undoBatch = (id: string) => {
    if (!ledger) return
    undo.mutate(
      { batchId: id, ledger },
      {
        onSuccess: (removed) => {
          setUndone(removed)
          setCsv(null)
          setSampleDone(null)
          setBatchId(null)
        },
      },
    )
  }

  const busy = backup.isPending || save.isPending || undo.isPending

  return (
    <Page
      title={t('data.title')}
      back={back}
      card={{
        icon: <IconTile icon={DatabaseIcon} size="large" />,
        description: t('data.description'),
      }}
    >
      {ledger && (
        <>
          {unreadable && (
            <Alert>{t(unreadable === 'mixed' ? 'data.mixedFiles' : 'data.unreadableFile')}</Alert>
          )}
          {undone !== null && <Alert tone="success">{t('data.undone', { count: undone })}</Alert>}
          <List label={t('data.takeOut')}>
            <ListButtonRow
              tone="text"
              leading={<IconTile icon={DownloadSimpleIcon} />}
              title={t('data.backup')}
              subtitle={t('data.backupHint')}
              disabled={busy}
              onClick={() => {
                backup.mutate()
              }}
            />
            <ListButtonRow
              tone="text"
              leading={<IconTile icon={TableIcon} />}
              title={t('data.spreadsheet')}
              subtitle={t('data.spreadsheetHint')}
              onClick={() => {
                downloadSpreadsheet(ledger)
              }}
            />
          </List>
          <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">{t('data.notEncrypted')}</p>

          <List label={t('data.bringIn')}>
            <ListButtonRow
              tone="text"
              leading={<IconTile icon={UploadSimpleIcon} />}
              title={t('data.importFile')}
              subtitle={t('data.importFileHint')}
              disabled={busy}
              onClick={() => {
                input.current?.click()
              }}
            />
            {/* Kept while early testers try Mirador out; it may go once people have
                their own data to bring in. */}
            <ListButtonRow
              tone="text"
              leading={<IconTile icon={FlaskIcon} />}
              title={t('data.sample')}
              subtitle={save.isPending ? t('data.working') : t('data.sampleHint')}
              disabled={busy}
              onClick={addSample}
            />
          </List>
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

          {ledger.batches.length > 0 && (
            <>
              <List label={t('data.imports')}>
                {ledger.batches.map((batch) => (
                  <ListButtonRow
                    key={batch.id}
                    tone="text"
                    title={batch.source === 'sample' ? t('data.sampleName') : batch.fileName}
                    subtitle={t('data.batchSubtitle', {
                      count: batch.imported,
                      date: formatShortDate(batch.importedAt.slice(0, 10), today, locale),
                    })}
                    onClick={() => {
                      setBatchId(batch.id)
                    }}
                  />
                ))}
              </List>
              <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">
                {t('data.importsNote')}
              </p>
            </>
          )}

          <List>
            <li>
              <button
                type="button"
                onClick={() => {
                  setErasing(true)
                }}
                className="flex min-h-[3.25rem] w-full items-center px-4 text-left text-[0.9375rem] text-danger focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
              >
                {t('data.erase.title')}
              </button>
            </li>
          </List>
          <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">{t('data.erase.note')}</p>

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
          />
          <Sheet
            open={sampleDone !== null}
            title={t('data.sample')}
            cancelLabel={t('nav.cancel')}
            onClose={() => {
              setSampleDone(null)
            }}
          >
            {sampleDone && (
              <DoneStep
                done={sampleDone}
                onClose={() => {
                  setSampleDone(null)
                }}
                onUndo={() => {
                  undoBatch(sampleDone.batchId)
                }}
              />
            )}
          </Sheet>
          <ActionSheet
            open={again !== null}
            title={t('data.again.title')}
            message={t('data.again.message', { date: again?.date ?? '' })}
            cancelLabel={t('nav.cancel')}
            actions={[
              {
                label: t('data.again.go'),
                onSelect: () => {
                  again?.go()
                  setAgain(null)
                },
              },
            ]}
            onClose={() => {
              setAgain(null)
            }}
          />
          <RestoreSheet
            file={archive}
            ledger={ledger}
            onClose={() => {
              setArchive(null)
            }}
          />
          <BatchSheet
            batch={ledger.batches.find((batch) => batch.id === batchId) ?? null}
            pending={undo.isPending}
            onUndo={undoBatch}
            onFix={(row) => {
              if (batchId) setFixing({ batchId, row })
              setBatchId(null)
            }}
            onClose={() => {
              setBatchId(null)
            }}
          />
          <EntrySheet
            open={fixing !== null}
            mode={{
              kind: 'new',
              source: 'import',
              seed: fixing ? waitingSeed(fixing.row) : {},
              ...(fixing ? { fromImport: { batchId: fixing.batchId, line: fixing.row.line } } : {}),
            }}
            onClose={() => {
              // Back to the import, to fix the next one.
              setBatchId(fixing?.batchId ?? null)
              setFixing(null)
            }}
          />
          <EraseSheet
            open={erasing}
            onClose={() => {
              setErasing(false)
            }}
          />
        </>
      )}
    </Page>
  )
}

/** What the form starts with for a row left for later: whatever could be read. */
function waitingSeed(row: WaitingRow) {
  return {
    type: row.amount !== undefined && row.amount > 0 ? ('income' as const) : ('expense' as const),
    ...(row.amount !== undefined ? { amount: Math.abs(row.amount) } : {}),
    ...(row.date ? { date: row.date } : {}),
    ...(row.walletId ? { walletId: row.walletId } : {}),
    ...(row.categoryId ? { categoryId: row.categoryId } : {}),
    ...(row.note ? { note: row.note } : {}),
  }
}
