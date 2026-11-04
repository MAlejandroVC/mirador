import { toCalendarDate } from '@repo/core'
import {
  joinStatements,
  type ReceiptReading,
  receiptAside,
  readStatement,
  type StatementTable,
} from '@repo/import'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { IconTile } from '../../components/ui/icon-tile'
import {
  CheckIcon,
  CircleNotchIcon,
  FilePdfIcon,
  ImageIcon,
  ReceiptIcon,
} from '../../components/ui/icons'
import { List, ListButtonRow, ListRow } from '../../components/ui/list'
import { Sheet } from '../../components/ui/sheet'
import { formatShortDate, useMoney } from '../../lib/format'
import type { Ledger } from '../wallets/use-ledger'
import { walletIconComponents } from '../wallets/wallet-look'
import type { ImportFile } from './import-model'
import { isPdf, isPicture, readPdf, readPicture, ReadingError, type ReadPage } from './reading'

// IMP-01, IMP-04, IMP-05: the statement's first step: the wallet it belongs to, and its
// files read one by one on this device (IMP-11). IMP-41: a picture among them that is a
// receipt rather than a page of the statement is set aside, to add with quick add.

type Progress =
  { state: 'waiting' } | { state: 'reading'; share: number } | { state: 'done'; pages: number }

export interface SetAside {
  file: File
  reading: ReceiptReading
}

export function ReadingStep({
  files,
  fingerprint,
  ledger,
  walletId,
  onWallet,
  onRead,
  onReceipt,
  onOnlyReceipt,
}: {
  files: readonly File[]
  fingerprint: string
  ledger: Ledger
  walletId: string | null
  onWallet: (walletId: string) => void
  onRead: (file: ImportFile) => void
  /** IMP-41: opens a receipt in quick add. */
  onReceipt?: (file: File) => void
  /** IMP-41: a single receipt and no statement goes straight to quick add. */
  onOnlyReceipt?: (file: File) => void
}) {
  const { t } = useTranslation()
  const money = useMoney(ledger.defaultCurrency)
  const today = toCalendarDate(new Date())
  const [progress, setProgress] = useState<Progress[]>(() =>
    files.map(() => ({ state: 'waiting' })),
  )
  const [failed, setFailed] = useState<ReadingError['reason'] | 'nothing' | 'different' | null>(
    null,
  )
  const [read, setRead] = useState<ImportFile | null>(null)
  const [receipts, setReceipts] = useState<SetAside[]>([])
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [picking, setPicking] = useState(false)
  const active = ledger.wallets.filter((wallet) => wallet.active)
  const wallet = active.find((item) => item.id === walletId)

  useEffect(() => {
    // A plain flag the clean-up sets; an object so the checks below see it change.
    const run = { stopped: false }
    const set = (index: number, next: Progress) => {
      if (!run.stopped) setProgress((all) => all.map((item, i) => (i === index ? next : item)))
    }
    void (async () => {
      const pages: ReadPage[] = []
      const tables: { table: StatementTable; pages: number }[] = []
      const aside: SetAside[] = []
      try {
        for (const [index, file] of files.entries()) {
          set(index, { state: 'reading', share: 0 })
          const pagesOfFile = isPdf(file)
            ? await readPdf(file, (done, total) => {
                set(index, { state: 'reading', share: done / total })
              })
            : [await readPicture(file)]
          if (run.stopped) return
          const table = readStatement(pagesOfFile, { year: new Date().getFullYear() })
          // IMP-41: a picture with no statement rows but a total is a receipt.
          const reading = isPicture(file)
            ? receiptAside(pagesOfFile, table, { currency: ledger.defaultCurrency, today })
            : null
          if (reading) {
            aside.push({ file, reading })
            set(index, { state: 'done', pages: pagesOfFile.length })
            continue
          }
          pages.push(...pagesOfFile)
          tables.push({ table, pages: pagesOfFile.length })
          set(index, { state: 'done', pages: pagesOfFile.length })
        }
      } catch (error) {
        if (!run.stopped) setFailed(error instanceof ReadingError ? error.reason : 'unreadable')
        return
      }
      if (run.stopped) return
      setReceipts(aside)
      if (tables.length === 0) {
        const [only] = aside
        if (aside.length === 0) setFailed('nothing')
        else if (aside.length === 1 && only && onOnlyReceipt) onOnlyReceipt(only.file)
        return
      }
      const table = joinStatements(tables)
      if (table === null) {
        setFailed('different')
        return
      }
      if (table.rows.length === 0) {
        setFailed('nothing')
        return
      }
      const name = files
        .filter((file) => !aside.some((receipt) => receipt.file === file))
        .map((file) => file.name)
        .join(', ')
        .slice(0, 255)
      setRead({
        name,
        fingerprint,
        table,
        pages: pages.map((page) =>
          page.image
            ? { url: page.image, width: page.width, height: page.height, words: page.words }
            : null,
        ),
      })
    })()
    return () => {
      run.stopped = true
    }
    // Read once, for the files the sheet opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const statementFiles = files.filter((file) => !receipts.some((receipt) => receipt.file === file))

  return (
    <>
      {active.length > 0 && statementFiles.length > 0 && (
        <List inset>
          <ListButtonRow
            tone="text"
            leading={
              <IconTile
                icon={walletIconComponents[wallet?.icon ?? 'wallet']}
                {...(wallet ? { color: wallet.color } : {})}
              />
            }
            title={t('data.statement.wallet')}
            trailing={
              <span className="text-[0.9375rem] text-brand">
                {wallet?.name ?? t('data.statement.chooseWallet')}
              </span>
            }
            onClick={() => {
              setPicking(true)
            }}
          />
        </List>
      )}
      {statementFiles.length > 0 && (
        <List
          inset
          label={receipts.length > 0 ? t('data.statement.statement') : t('data.reading.files')}
        >
          {statementFiles.map((file) => {
            const index = files.indexOf(file)
            const item = progress[index] ?? { state: 'waiting' }
            return (
              <ListRow
                key={`${file.name}-${String(index)}`}
                leading={<IconTile icon={isPdf(file) ? FilePdfIcon : ImageIcon} />}
                title={file.name}
                subtitle={
                  item.state === 'done' ? (
                    read ? (
                      t('data.rows', { count: read.table.rows.length })
                    ) : (
                      t('data.reading.pages', { count: item.pages })
                    )
                  ) : item.state === 'reading' ? (
                    // DL-COL-06: a progress bar in the softer tone of its color.
                    <span
                      role="progressbar"
                      aria-label={t('data.reading.reading')}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(item.share * 100)}
                      className="mt-1.5 block h-[0.3125rem] overflow-hidden rounded-full bg-fill"
                    >
                      <span
                        className="block h-full rounded-full bg-[color-mix(in_srgb,var(--color-brand)_52%,var(--color-surface))] transition-[width] duration-300"
                        style={{ width: `${String(Math.max(8, item.share * 100))}%` }}
                      />
                    </span>
                  ) : (
                    t('data.reading.waiting')
                  )
                }
                trailing={
                  item.state === 'done' ? (
                    <span className="grid size-6 place-items-center rounded-full bg-brand text-on-brand">
                      <CheckIcon
                        aria-label={t('data.reading.read')}
                        weight="bold"
                        className="size-3.5"
                      />
                    </span>
                  ) : item.state === 'reading' ? (
                    <CircleNotchIcon
                      aria-label={t('data.reading.reading')}
                      weight="bold"
                      className="size-5 animate-spin text-brand motion-reduce:animate-none"
                    />
                  ) : null
                }
              />
            )
          })}
        </List>
      )}
      {receipts.length > 0 && (
        <>
          <List inset label={t('data.statement.receipt')}>
            {receipts.map((receipt, index) => (
              <ListRow
                key={`${receipt.file.name}-${String(index)}`}
                leading={<IconTile icon={ReceiptIcon} />}
                title={[
                  receipt.reading.payee,
                  receipt.reading.amount !== null
                    ? money.text({
                        minor: receipt.reading.amount,
                        currency: ledger.defaultCurrency,
                      })
                    : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                subtitle={[
                  receipt.file.name,
                  receipt.reading.date
                    ? formatShortDate(receipt.reading.date, today, money.locale)
                    : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  onReceipt && (
                    // DL-CMP-05: tinted, a second action beside the row's own.
                    <button
                      type="button"
                      disabled={added.has(index)}
                      onClick={() => {
                        setAdded(new Set([...added, index]))
                        onReceipt(receipt.file)
                      }}
                      className="min-h-11 shrink-0 rounded-xl bg-[color-mix(in_srgb,var(--color-brand)_14%,var(--color-surface))] px-3.5 text-[0.9375rem] font-semibold text-brand focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40"
                    >
                      {added.has(index) ? t('data.statement.added') : t('data.statement.addIt')}
                    </button>
                  )
                }
              />
            ))}
          </List>
          <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">
            {t('data.statement.receiptNote', { count: receipts.length })}
          </p>
        </>
      )}
      {!read && !failed && (
        <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">{t('data.reading.private')}</p>
      )}
      {failed && <Alert>{t(`data.reading.failed.${failed}`)}</Alert>}
      {read && (
        <Button
          className="mt-2 w-full"
          onClick={() => {
            onRead(read)
          }}
        >
          {t('data.statement.review')}
        </Button>
      )}
      <Sheet
        open={picking}
        title={t('data.statement.wallet')}
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          setPicking(false)
        }}
      >
        <List inset>
          {active.map((item) => (
            <ChoiceRow
              key={item.id}
              role="radio"
              leading={<IconTile icon={walletIconComponents[item.icon]} color={item.color} />}
              title={item.name}
              subtitle={item.currency}
              checked={item.id === walletId}
              onToggle={() => {
                onWallet(item.id)
                setPicking(false)
              }}
            />
          ))}
        </List>
      </Sheet>
    </>
  )
}
