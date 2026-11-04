import type { ImportBatchRecord } from '@repo/api'
import type { Transaction } from '@repo/core'
import { toCalendarDate } from '@repo/core'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { ActionSheet } from '../../components/ui/action-sheet'
import { Alert } from '../../components/ui/alert'
import { Amount } from '../../components/ui/amount'
import { Button } from '../../components/ui/button'
import { IconTile } from '../../components/ui/icon-tile'
import {
  ClockCounterClockwiseIcon,
  FileTextIcon,
  ReceiptIcon,
  TableIcon,
} from '../../components/ui/icons'
import { List, ListButtonRow, ListRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet } from '../../components/ui/sheet'
import { formatShortDate, useMoney } from '../../lib/format'
import { EntrySheet } from '../transactions/entry-sheet'
import { useTransactionEditor } from '../transactions/use-transaction-editor'
import { type Ledger, useLedger } from '../wallets/use-ledger'
import type { WaitingRow } from './data-sheets'
import { Importer, type ImporterMessage } from './importer'
import { changedSettings, waitingSeed } from './statement-model'
import { useUndoImport } from './use-data'

// IMP-42: Settings › Your data › Imports. Everything brought in, by type (statements,
// receipts, files), each with what it added, skipped and changed, and its undo: a
// statement that changed the wallet's settings can be undone whole, or only its
// transactions, keeping the settings. IMP-33: rows left for later are fixed here.

type Batch = ImportBatchRecord & { id: string }
type Kind = 'statement' | 'receipt' | 'file'
type Filter = 'all' | Kind

const kindOf = (batch: Batch): Kind =>
  batch.source === 'statement' ? 'statement' : batch.source === 'receipt' ? 'receipt' : 'file'

const icons = { statement: FileTextIcon, receipt: ReceiptIcon, file: TableIcon } as const

export function ImportsScreen({ open, undo: undoNow }: { open?: string; undo?: boolean }) {
  const { t } = useTranslation()
  const back = useBack()
  const { data: ledger } = useLedger()
  const [filter, setFilter] = useState<Filter>('all')
  const [opened, setOpened] = useState<string | null>(open ?? null)
  const [confirming, setConfirming] = useState<string | null>(undoNow && open ? open : null)
  const [fixing, setFixing] = useState<{ batchId: string; row: WaitingRow } | null>(null)
  const [message, setMessage] = useState<ImporterMessage | null>(null)
  const undo = useUndoImport()
  const input = useRef<HTMLInputElement>(null)
  const editor = useTransactionEditor()
  if (!ledger) return null
  const batch = ledger.batches.find((item) => item.id === opened) ?? null
  const confirmed = ledger.batches.find((item) => item.id === confirming) ?? null

  const undoBatch = (id: string, keepSettings: boolean) => {
    undo.mutate(
      { batchId: id, ledger, keepSettings },
      {
        onSuccess: (removed) => {
          setMessage({ kind: 'undone', count: removed })
          setOpened(null)
        },
      },
    )
  }
  const shown = (kind: Kind) => filter === 'all' || filter === kind
  const of = (kind: Kind) => ledger.batches.filter((item) => kindOf(item) === kind)

  return (
    <Page
      title={t('data.imports')}
      back={back}
      card={{
        icon: <IconTile icon={ClockCounterClockwiseIcon} size="large" />,
        description: t('data.importsPage.description'),
      }}
    >
      {message?.kind === 'undone' && (
        <Alert tone="success">{t('data.undone', { count: message.count })}</Alert>
      )}
      {message && message.kind !== 'undone' && (
        <Alert>{t(message.kind === 'mixed' ? 'data.mixedFiles' : 'data.unreadableFile')}</Alert>
      )}
      <SegmentedControl
        label={t('data.importsPage.show')}
        options={(['all', 'statement', 'receipt', 'file'] as const).map((value) => ({
          value,
          label: t(`data.importsPage.filters.${value}`),
        }))}
        value={filter}
        onChange={setFilter}
      />
      {(['statement', 'receipt', 'file'] as const).map((kind) =>
        shown(kind) && of(kind).length > 0 ? (
          <List key={kind} label={t(`data.importsPage.sections.${kind}`)}>
            {of(kind).map((item) => (
              <ImportRow
                key={item.id}
                batch={item}
                ledger={ledger}
                onOpen={() => {
                  setOpened(item.id)
                }}
              />
            ))}
          </List>
        ) : null,
      )}
      {(['statement', 'receipt', 'file'] as const).every(
        (kind) => !shown(kind) || of(kind).length === 0,
      ) && (
        <p className="px-4 text-[0.9375rem] text-text-muted">
          {t(`data.importsPage.none.${filter}`)}
        </p>
      )}
      <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">{t('data.importsNote')}</p>

      <Sheet
        open={batch !== null}
        title={batch ? titleOf(batch, ledger, t) : ''}
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          setOpened(null)
        }}
      >
        {batch && (
          <ImportDetail
            batch={batch}
            ledger={ledger}
            pending={undo.isPending}
            onEdit={(transaction) => {
              setOpened(null)
              editor.open(transaction)
            }}
            onFix={(row) => {
              setFixing({ batchId: batch.id, row })
              setOpened(null)
            }}
            onReviewAgain={() => {
              input.current?.click()
            }}
            onUndo={() => {
              setConfirming(batch.id)
            }}
          />
        )}
      </Sheet>
      <UndoChoice
        batch={confirmed}
        ledger={ledger}
        onUndo={(keepSettings) => {
          if (confirmed) undoBatch(confirmed.id, keepSettings)
          setConfirming(null)
        }}
        onClose={() => {
          setConfirming(null)
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
          setOpened(fixing?.batchId ?? null)
          setFixing(null)
        }}
      />
      {editor.sheet}
      {/* "Review again": the statement is read again; what's in Mirador is skipped. */}
      <Importer ledger={ledger} input={input} again={false} onMessage={setMessage} />
    </Page>
  )
}

type T = ReturnType<typeof useTranslation>['t']

/** The transactions an import added, newest first. */
function addedBy(batch: Batch, ledger: Ledger) {
  return ledger.transactions
    .filter((transaction) => transaction.importBatchId === batch.id)
    .filter((transaction) => transaction.kind !== 'openingBalance')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

function monthOf(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}

/** "Banco Ejemplo · October" for a statement, "OXXO" for a receipt, the file's name. */
function titleOf(batch: Batch, ledger: Ledger, t: T, locale = 'en') {
  const kind = kindOf(batch)
  if (batch.source === 'sample') return t('data.sampleName')
  const added = addedBy(batch, ledger)
  const first = added[0]
  if (kind === 'receipt' && first) {
    const payee = ledger.payees.find((item) => item.id === first.payeeId)
    return payee?.name ?? batch.fileName
  }
  if (kind === 'statement' && first) {
    const wallet = ledger.wallets.find((item) => item.id === first.walletId)
    if (wallet) return `${wallet.name} · ${monthOf(first.date, locale)}`
  }
  return batch.fileName
}

function ImportRow({
  batch,
  ledger,
  onOpen,
}: {
  batch: Batch
  ledger: Ledger
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const money = useMoney(ledger.defaultCurrency)
  const today = toCalendarDate(new Date())
  const kind = kindOf(batch)
  const when = formatShortDate(batch.importedAt.slice(0, 10), today, money.locale)
  const first = addedBy(batch, ledger)[0]
  const title =
    kind === 'receipt' && first
      ? `${titleOf(batch, ledger, t, money.locale)} · ${money.text({ minor: Math.abs(first.amount), currency: ledger.wallets.find((w) => w.id === first.walletId)?.currency ?? ledger.defaultCurrency })}`
      : titleOf(batch, ledger, t, money.locale)
  const subtitle =
    batch.waiting.length > 0 ? (
      // DL-COL-05: rows that wait are a gentle caution.
      <span className="text-warning">
        {t('data.importsPage.waiting', { count: batch.waiting.length })}
      </span>
    ) : kind === 'receipt' ? (
      t('data.importsPage.receiptSubtitle', { date: when })
    ) : (
      t('data.batchSubtitle', { count: batch.imported, date: when })
    )
  return (
    <ListButtonRow
      tone="text"
      leading={<IconTile icon={icons[kind]} />}
      title={title}
      subtitle={subtitle}
      onClick={onOpen}
    />
  )
}

// How many added transactions show before "N more".
const shownAdded = 4

function ImportDetail({
  batch,
  ledger,
  pending,
  onEdit,
  onFix,
  onReviewAgain,
  onUndo,
}: {
  batch: Batch
  ledger: Ledger
  pending: boolean
  onEdit: (transaction: Transaction) => void
  onFix: (row: WaitingRow) => void
  onReviewAgain: () => void
  onUndo: () => void
}) {
  const { t } = useTranslation()
  const money = useMoney(ledger.defaultCurrency)
  const today = toCalendarDate(new Date())
  const [all, setAll] = useState(false)
  const kind = kindOf(batch)
  const added = addedBy(batch, ledger)
  const number = (value: number) => new Intl.NumberFormat(money.locale).format(value)
  const value = (text: string) => (
    <span className="text-[0.9375rem] text-text-muted tabular-nums">{text}</span>
  )
  const categories = new Map(ledger.categories.map((category) => [category.id, category.name]))
  const payees = new Map(ledger.payees.map((payee) => [payee.id, payee.name]))
  const wallets = new Map(ledger.wallets.map((wallet) => [wallet.id, wallet]))
  const row = (transaction: Transaction, showWallet = false) => {
    const wallet = wallets.get(transaction.walletId)
    const currency = wallet?.currency ?? ledger.defaultCurrency
    const plan = transaction.installments
    return (
      <ListButtonRow
        key={transaction.id}
        tone="text"
        title={
          (transaction.payeeId ? payees.get(transaction.payeeId) : undefined) ??
          transaction.note ??
          (transaction.categoryId ? categories.get(transaction.categoryId) : undefined) ??
          ''
        }
        subtitle={[
          formatShortDate(transaction.date, today, money.locale),
          transaction.categoryId ? categories.get(transaction.categoryId) : '',
          plan ? t('data.importsPage.months', { count: plan.months }) : '',
          showWallet ? wallet?.name : '',
        ]
          .filter(Boolean)
          .join(' · ')}
        trailing={
          <span className="text-text">
            {transaction.amount > 0 ? (
              <Amount
                tone="moss"
                parts={money.parts({ minor: transaction.amount, currency }, 'always')}
                label={money.text({ minor: transaction.amount, currency }, 'always')}
              />
            ) : (
              <Amount
                parts={money.parts({ minor: Math.abs(transaction.amount), currency })}
                label={money.text({ minor: Math.abs(transaction.amount), currency })}
              />
            )}
          </span>
        }
        onClick={() => {
          onEdit(transaction)
        }}
      />
    )
  }

  if (kind === 'receipt') {
    const [expense] = added
    // IMP-21: a statement that came in later found this expense and kept it.
    const statement = expense
      ? ledger.batches.find(
          (other) =>
            other.source === 'statement' && other.merged.some((item) => item.id === expense.id),
        )
      : undefined
    const statementWallet = expense ? wallets.get(expense.walletId) : undefined
    return (
      <>
        <p className="-mt-1 text-center text-[0.8125rem] text-text-muted">
          {t('data.importsPage.receiptAdded', {
            date: formatShortDate(batch.importedAt.slice(0, 10), today, money.locale),
          })}
        </p>
        {expense && (
          <List inset label={t('data.importsPage.expense')}>
            {row(expense, true)}
          </List>
        )}
        <List inset>
          <ListRow
            title={t('data.importsPage.onStatement')}
            trailing={value(
              statement && expense
                ? `${monthOf(expense.date, money.locale)}, ${statementWallet?.name ?? ''}`
                : t('data.importsPage.notYet'),
            )}
          />
        </List>
        <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">
          {statement ? t('data.importsPage.foundOnStatement') : t('data.importsPage.willMerge')}
        </p>
        {expense && (
          <Button variant="danger" className="mt-2 w-full" disabled={pending} onClick={onUndo}>
            {pending ? t('data.working') : t('data.importsPage.remove')}
          </Button>
        )}
      </>
    )
  }

  const settings = batch.settings
  const wallet = settings ? wallets.get(settings.walletId) : undefined
  const walletMoney = (minor: number) =>
    money.text({ minor, currency: wallet?.currency ?? ledger.defaultCurrency })
  const recurring = new Map(ledger.recurring.map((item) => [item.id, item]))
  return (
    <>
      <p className="-mt-1 text-center text-[0.8125rem] text-text-muted">
        {t(`data.importsPage.kinds.${kind}`)} ·{' '}
        {t('data.importsPage.imported', {
          date: formatShortDate(batch.importedAt.slice(0, 10), today, money.locale),
        })}
      </p>
      <List inset>
        <ListRow
          title={t('data.importsPage.added')}
          trailing={value(t('data.importsPage.transactions', { count: batch.imported }))}
        />
        <ListRow
          title={t('data.importsPage.alreadyIn')}
          trailing={value(
            t('data.importsPage.skipped', {
              count: Math.max(0, batch.skipped - batch.waiting.length) + batch.merged.length,
            }),
          )}
        />
      </List>
      {changedSettings(batch) && settings && (
        <List inset label={t('data.importsPage.walletChanges')}>
          {settings.changed.map((change) => (
            <ListRow
              key={change.kind}
              title={t(`data.importsPage.changes.${change.kind}`)}
              trailing={value(
                change.kind === 'limit'
                  ? change.before
                    ? `${walletMoney(change.before)} → ${walletMoney(change.after)}`
                    : walletMoney(change.after)
                  : change.before
                    ? t('data.importsPage.dayChange', {
                        before: change.before,
                        after: change.after,
                      })
                    : t('data.importsPage.day', { day: change.after }),
              )}
            />
          ))}
          {settings.recurring.map((item) => {
            const found = recurring.get(item.id)
            const name = (found?.payeeId ? payees.get(found.payeeId) : undefined) ?? ''
            return (
              <ListRow
                key={item.id}
                title={t('data.importsPage.recurring', { name })}
                trailing={value(t('data.importsPage.turnedOn'))}
              />
            )
          })}
        </List>
      )}
      {added.length > 0 && (
        <List inset label={t('data.importsPage.added')}>
          {(all ? added : added.slice(0, shownAdded)).map((transaction) => row(transaction))}
          {!all && added.length > shownAdded && (
            <ListButtonRow
              title={t('data.review.more', { count: added.length - shownAdded })}
              onClick={() => {
                setAll(true)
              }}
            />
          )}
        </List>
      )}
      {batch.waiting.length > 0 && (
        <>
          <List inset label={t('data.batch.waiting')}>
            {batch.waiting.slice(0, 50).map((waiting) => (
              <ListButtonRow
                key={waiting.line}
                tone="text"
                title={t('data.review.row', { line: number(waiting.line) })}
                subtitle={`${t(`data.problems.${waiting.problem}`)}${waiting.text ? ` · ${waiting.text}` : ''}`}
                trailing={
                  <span className="text-[0.9375rem] text-brand">{t('data.batch.fix')}</span>
                }
                onClick={() => {
                  onFix(waiting)
                }}
              />
            ))}
          </List>
          <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">
            {t('data.batch.waitingNote')}
          </p>
        </>
      )}
      {kind === 'statement' && (
        <>
          <Button variant="secondary" className="mt-2 w-full" onClick={onReviewAgain}>
            {t('data.importsPage.reviewAgain')}
          </Button>
          <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">
            {t('data.importsPage.reviewAgainHint')}
          </p>
        </>
      )}
      <Button variant="ghost" className="w-full text-danger" disabled={pending} onClick={onUndo}>
        {pending ? t('data.working') : t('data.importsPage.undo')}
      </Button>
    </>
  )
}

/**
 * IMP-42: undoing an import that changed the wallet asks what to undo: everything, or
 * only its transactions. One that changed nothing else is a single undo.
 */
function UndoChoice({
  batch,
  ledger,
  onUndo,
  onClose,
}: {
  batch: Batch | null
  ledger: Ledger
  onUndo: (keepSettings: boolean) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const choice = batch ? changedSettings(batch) : false
  const settings = batch?.settings
  const wallet = settings ? ledger.wallets.find((item) => item.id === settings.walletId) : undefined
  const count = settings ? settings.changed.length + settings.recurring.length : 0
  return (
    <ActionSheet
      open={batch !== null}
      title={
        batch?.source === 'receipt'
          ? t('data.importsPage.removeTitle')
          : t('data.batch.confirmTitle')
      }
      message={
        batch?.source === 'receipt'
          ? t('data.importsPage.removeMessage')
          : choice
            ? t('data.importsPage.undoMessage', {
                count: batch?.imported ?? 0,
                settings: t('data.importsPage.settingsCount', { count }),
                wallet: wallet?.name ?? '',
              })
            : t('data.batch.confirmMessage', { count: batch?.imported ?? 0 })
      }
      cancelLabel={t('nav.cancel')}
      actions={
        choice
          ? [
              {
                label: t('data.importsPage.undoEverything'),
                tone: 'danger',
                onSelect: () => {
                  onUndo(false)
                },
              },
              {
                label: t('data.importsPage.undoTransactions'),
                tone: 'danger',
                onSelect: () => {
                  onUndo(true)
                },
              },
            ]
          : [
              {
                label:
                  batch?.source === 'receipt' ? t('data.importsPage.remove') : t('data.done.undo'),
                tone: 'danger',
                onSelect: () => {
                  onUndo(false)
                },
              },
            ]
      }
      onClose={onClose}
    />
  )
}
