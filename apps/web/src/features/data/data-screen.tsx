import { fractionDigits } from '@repo/core'
import {
  defaultDecisions,
  linkCategories,
  linkWallets,
  planRows,
  sampleBalances,
  sampleRows,
  type WalletLink,
  type WalletPreset,
} from '@repo/import'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { Alert } from '../../components/ui/alert'
import { IconTile } from '../../components/ui/icon-tile'
import {
  ClockCounterClockwiseIcon,
  DatabaseIcon,
  DownloadSimpleIcon,
  FlaskIcon,
  TableIcon,
  UploadSimpleIcon,
} from '../../components/ui/icons'
import { List, ListButtonRow, ListLinkRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { Sheet } from '../../components/ui/sheet'
import { newId, useLedger, useSaveRecords } from '../wallets/use-ledger'
import { EraseSheet } from './data-sheets'
import { buildChanges, currencyOf } from './import-model'
import { DoneStep, type ImportDone } from './import-sheet'
import { Importer, type ImporterMessage } from './importer'
import { downloadSpreadsheet, useDownloadBackup, useUndoImport } from './use-data'

// Settings > Your data (Epic 9): take everything out as a Mirador backup (DAT-01) or a
// spreadsheet (DAT-02), bring a backup back (DAT-04, DAT-05) or a CSV in (IMP-02,
// DAT-12), see every import and undo any of them (IMP-34, IMP-35), and erase everything
// (DAT-11). Files are made and read on this device; the server never sees them (SEC-01).
export function DataScreen() {
  const { t } = useTranslation()
  const back = useBack()
  const { data: ledger } = useLedger()
  const backup = useDownloadBackup()
  const undo = useUndoImport()
  const save = useSaveRecords()
  const input = useRef<HTMLInputElement>(null)
  const [erasing, setErasing] = useState(false)
  const [message, setMessage] = useState<ImporterMessage | null>(null)
  const [sampleDone, setSampleDone] = useState<ImportDone | null>(null)
  const today = new Date().toISOString().slice(0, 10)
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
  const undoSample = (id: string) => {
    if (!ledger) return
    undo.mutate(
      { batchId: id, ledger },
      {
        onSuccess: (removed) => {
          setMessage({ kind: 'undone', count: removed })
          setSampleDone(null)
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
          {message && message.kind !== 'undone' && (
            <Alert>{t(message.kind === 'mixed' ? 'data.mixedFiles' : 'data.unreadableFile')}</Alert>
          )}
          {message?.kind === 'undone' && (
            <Alert tone="success">{t('data.undone', { count: message.count })}</Alert>
          )}
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
            {/* IMP-42: every import, by type, each of which can be undone. */}
            {ledger.batches.length > 0 && (
              <ListLinkRow
                to="/settings/imports"
                leading={<IconTile icon={ClockCounterClockwiseIcon} />}
                title={t('data.imports')}
                subtitle={t('data.importsHint')}
                trailing={
                  <span className="text-[0.9375rem] text-text-muted tabular-nums">
                    {ledger.batches.length}
                  </span>
                }
              />
            )}
          </List>
          <Importer ledger={ledger} input={input} onMessage={setMessage} />
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
                  undoSample(sampleDone.batchId)
                }}
              />
            )}
          </Sheet>
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
