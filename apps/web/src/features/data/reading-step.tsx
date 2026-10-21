import { joinStatements, readStatement, type StatementTable } from '@repo/import'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '../../components/ui/alert'
import { IconTile } from '../../components/ui/icon-tile'
import { CheckIcon, CircleNotchIcon, FilePdfIcon, ImageIcon } from '../../components/ui/icons'
import { List, ListRow } from '../../components/ui/list'
import type { ImportFile } from './import-model'
import { isPdf, readPdf, readPicture, ReadingError, type ReadPage } from './reading'

// IMP-01, IMP-04, IMP-05: the import sheet's first step for PDFs and pictures. Each file
// is read in turn (a text PDF here, pictures and scans by the person's server, which
// keeps nothing), then all their pages become one statement for the wizard's steps.

type Progress =
  { state: 'waiting' } | { state: 'reading'; share: number } | { state: 'done'; pages: number }

export function ReadingStep({
  files,
  fingerprint,
  onRead,
}: {
  files: readonly File[]
  fingerprint: string
  onRead: (file: ImportFile) => void
}) {
  const { t } = useTranslation()
  const [progress, setProgress] = useState<Progress[]>(() =>
    files.map(() => ({ state: 'waiting' })),
  )
  const [failed, setFailed] = useState<ReadingError['reason'] | 'nothing' | 'different' | null>(
    null,
  )

  useEffect(() => {
    // A plain flag the clean-up sets; an object so the checks below see it change.
    const run = { stopped: false }
    const set = (index: number, next: Progress) => {
      if (!run.stopped) setProgress((all) => all.map((item, i) => (i === index ? next : item)))
    }
    void (async () => {
      const pages: ReadPage[] = []
      const tables: { table: StatementTable; pages: number }[] = []
      try {
        for (const [index, file] of files.entries()) {
          set(index, { state: 'reading', share: 0 })
          const read = isPdf(file)
            ? await readPdf(file, (done, total) => {
                set(index, { state: 'reading', share: done / total })
              })
            : [await readPicture(file)]
          if (run.stopped) return
          pages.push(...read)
          tables.push({
            table: readStatement(read, { year: new Date().getFullYear() }),
            pages: read.length,
          })
          set(index, { state: 'done', pages: read.length })
        }
      } catch (error) {
        if (!run.stopped) setFailed(error instanceof ReadingError ? error.reason : 'unreadable')
        return
      }
      if (run.stopped) return
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
        .map((file) => file.name)
        .join(', ')
        .slice(0, 255)
      onRead({
        name,
        fingerprint,
        table,
        pages: pages.map((page) =>
          page.image ? { url: page.image, width: page.width, height: page.height } : null,
        ),
      })
    })()
    return () => {
      run.stopped = true
    }
    // Read once, for the files the sheet opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <List inset label={t('data.reading.files')}>
        {files.map((file, index) => {
          const item = progress[index] ?? { state: 'waiting' }
          return (
            <ListRow
              key={`${file.name}-${String(index)}`}
              leading={<IconTile icon={isPdf(file) ? FilePdfIcon : ImageIcon} />}
              title={file.name}
              subtitle={
                item.state === 'done' ? (
                  t('data.reading.pages', { count: item.pages })
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
      <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">{t('data.reading.private')}</p>
      {failed && <Alert>{t(`data.reading.failed.${failed}`)}</Alert>}
    </>
  )
}
