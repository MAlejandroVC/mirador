import { toCalendarDate } from '@repo/core'
import {
  type Box,
  type CategoryLink,
  type ColumnSettings,
  type Decisions,
  fieldsOf,
  type PlannedRow,
  type StatementTable,
  summarize,
  type WalletLink,
  type WalletUpdate,
} from '@repo/import'
import { type PointerEvent as ReactPointerEvent, type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '../../components/ui/alert'
import { Amount } from '../../components/ui/amount'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { IconTile } from '../../components/ui/icon-tile'
import { CheckIcon, SelectionPlusIcon } from '../../components/ui/icons'
import { List, ListButtonRow, ListRow } from '../../components/ui/list'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { formatShortDate, useMoney } from '../../lib/format'
import { useMediaQuery } from '../../lib/use-media-query'
import type { Ledger } from '../wallets/use-ledger'
import { walletIconComponents } from '../wallets/wallet-look'
import type { Fix, ImportFile } from './import-model'
import { type PageBox, PagePart } from './page-part'
import { balanceOff, importCount, rowRegion, sourceOf } from './statement-model'
import { AddRowSheet, CheckRowSheet, LayoutSheet, UpdateSheet } from './statement-sheets'

// IMP-40: reviewing a statement. The list leads: one example row shows, boxed on the
// page, how every row was read, with a way to fix the layout once for all of them
// (IMP-14); only the rows worth a look are listed, each checked against its part of
// the page. The statement itself is a tap away (beside the list on a wide screen),
// every row boxed and tagged, and a row the reader missed is added by drawing a box
// around it. IMP-37: whether the rows add up to its balance.

export type StatementFile = ImportFile & { table: StatementTable }

export interface ReviewProps {
  ledger: Ledger
  file: StatementFile
  settings: ColumnSettings
  /** IMP-03: read with a layout remembered from an earlier statement. */
  remembered: boolean
  planned: readonly PlannedRow[]
  wallets: readonly WalletLink[]
  categories: readonly CategoryLink[]
  walletId: string | null
  decisions: Decisions
  fixes: ReadonlyMap<number, Fix>
  updates: readonly WalletUpdate[]
  /** IMP-39: which updates stay on, by position. */
  chosen: ReadonlySet<number>
  saving: boolean
  failed: boolean
  onDecisions: (decisions: Decisions) => void
  onFix: (line: number, fix: Fix, categoryId: string | null) => void
  onAddRow: (page: number, box: Box, fix: Fix, categoryId: string | null) => void
  onSettings: (settings: ColumnSettings) => void
  onForget: () => void
  onChosen: (chosen: ReadonlySet<number>) => void
  onImport: () => void
}

// How many ready rows show before "N more".
const shownRows = 4

export function StatementReview(props: ReviewProps) {
  const { t } = useTranslation()
  const wide = useMediaQuery('(min-width: 1024px)')
  const [view, setView] = useState<'list' | 'statement'>('list')
  const [checking, setChecking] = useState<PlannedRow | null>(null)
  const [drawn, setDrawn] = useState<{ page: number; box: Box } | null>(null)
  const [fixing, setFixing] = useState(false)
  const [updating, setUpdating] = useState(false)
  const count = importCount(props.planned, props.decisions)

  const statement = (
    <StatementView
      {...props}
      onRow={setChecking}
      onDrawn={(page, box) => {
        setDrawn({ page, box })
      }}
    />
  )
  return (
    // DL-LAY-06: on a wide screen the list and the statement sit side by side.
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[25rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className="flex flex-col gap-3">
        {!wide && (
          <SegmentedControl
            label={t('data.statement.show')}
            options={[
              { value: 'list', label: t('data.statement.list') },
              { value: 'statement', label: t('data.statement.statement') },
            ]}
            value={view}
            onChange={setView}
          />
        )}
        {wide || view === 'list' ? (
          <ListView
            {...props}
            onRow={setChecking}
            onFixLayout={() => {
              setFixing(true)
            }}
            onFind={() => {
              setView('statement')
            }}
            onUpdate={() => {
              setUpdating(true)
            }}
          />
        ) : (
          statement
        )}
        {props.failed && <Alert>{t('data.review.failed')}</Alert>}
        {count === 0 && <Alert tone="warning">{t('data.review.nothing')}</Alert>}
        <Button
          className="mt-2 w-full"
          disabled={props.saving || count === 0}
          onClick={props.onImport}
        >
          {props.saving ? t('data.review.saving') : t('data.review.import', { count })}
        </Button>
      </div>
      {wide && (
        <div className="sticky top-0 flex max-h-[calc(92dvh-5.5rem)] flex-col gap-3 overflow-y-auto rounded-2xl bg-inset p-3">
          {statement}
        </div>
      )}
      <CheckRowSheet
        item={checking}
        {...props}
        onClose={() => {
          setChecking(null)
        }}
      />
      <AddRowSheet
        drawn={drawn}
        {...props}
        onClose={() => {
          setDrawn(null)
        }}
      />
      <LayoutSheet
        open={fixing}
        {...props}
        onClose={() => {
          setFixing(false)
        }}
      />
      <UpdateSheet
        open={updating}
        {...props}
        onClose={() => {
          setUpdating(false)
        }}
      />
    </div>
  )
}

function useRowWords(props: Pick<ReviewProps, 'ledger' | 'categories' | 'decisions'>) {
  const { t } = useTranslation()
  const money = useMoney(props.ledger.defaultCurrency)
  const today = toCalendarDate(new Date())
  const names = new Map(props.ledger.categories.map((category) => [category.id, category.name]))
  const linked = new Map(props.categories.map((link) => [link.key, link]))
  return {
    money,
    today,
    label: (item: PlannedRow) =>
      item.row.payee || item.row.note || t('data.review.row', { line: item.row.line }),
    // DL-NUM-03, DL-COL-07: an expense has no sign; money in is Moss with a plus.
    amount: (item: PlannedRow) => {
      const minor = item.row.amount ?? 0
      const value = { minor: Math.abs(minor), currency: item.row.currency }
      return minor > 0 ? (
        <Amount
          tone="moss"
          parts={money.parts(value, 'always')}
          label={money.text(value, 'always')}
        />
      ) : (
        <Amount parts={money.parts(value)} label={money.text(value)} />
      )
    },
    date: (value: string | null) => (value ? formatShortDate(value, today, money.locale) : ''),
    category: (item: PlannedRow) => {
      const chosen = props.decisions.categories.get(item.row.line)
      const link = item.categoryKey ? linked.get(item.categoryKey) : undefined
      const id =
        chosen ??
        (link?.target.kind === 'existing' ? link.target.id : null) ??
        item.suggestedCategoryId
      return id ? (names.get(id) ?? '') : (link?.name ?? '')
    },
  }
}

function ListView(
  props: ReviewProps & {
    onRow: (item: PlannedRow) => void
    onFixLayout: () => void
    onFind: () => void
    onUpdate: () => void
  },
) {
  const { t } = useTranslation()
  const words = useRowWords(props)
  const wide = useMediaQuery('(min-width: 1024px)')
  const [allReady, setAllReady] = useState(false)
  const { planned, decisions, ledger } = props
  const transactions = new Map(ledger.transactions.map((tx) => [tx.id, tx]))
  const recurring = new Map(ledger.recurring.map((item) => [item.id, item]))
  const payees = new Map(ledger.payees.map((payee) => [payee.id, payee.name]))
  const wallet = ledger.wallets.find((item) => item.id === props.walletId)

  const toLookAt = planned.filter(({ status }) =>
    ['check', 'plan', 'noCategory', 'unreadable', 'transfer'].includes(status.kind),
  )
  const already = planned.filter(({ status }) =>
    ['duplicate', 'installment', 'merge'].includes(status.kind),
  )
  const ready = planned.filter(({ status }) => status.kind === 'ready')
  const summary = summarize(planned)
  const lookAtRows = toLookAt.filter(
    (item) => !(item.status.kind === 'transfer' && !item.status.outgoing),
  )

  // IMP-29: a match with a recurring transaction says which one.
  const duplicateText = (item: PlannedRow) => {
    if (item.status.kind !== 'duplicate') return ''
    const match = transactions.get(item.status.matchId)
    const from = match?.recurringId ? recurring.get(match.recurringId) : undefined
    if (from) {
      const name = from.payeeId ? payees.get(from.payeeId) : undefined
      return name ? t('data.statement.recurringNamed', { name }) : t('data.statement.recurring')
    }
    return t('data.statement.sameAs', { date: words.date(match?.date ?? null) })
  }
  const reason = (item: PlannedRow): ReactNode => {
    const { status, row } = item
    if (decisions.ignore?.has(row.line)) return t('data.statement.leftOut')
    switch (status.kind) {
      case 'check':
        // DL-COL-05: a gentle caution in `warning`, words only.
        return (
          <span className="text-warning">
            {row.date === null
              ? t('data.review.checkMissing.date')
              : row.amount === null
                ? t('data.review.checkMissing.amount')
                : t(`data.statement.hard.${status.fields.join('-') || 'amount'}`)}
          </span>
        )
      case 'plan':
        return decisions.single?.has(row.line)
          ? t('data.statement.notPlan')
          : t('data.statement.newPlan', { month: status.month, months: status.months })
      case 'noCategory':
        return t('data.statement.needsCategory')
      case 'unreadable':
        return (
          <span className="text-warning">
            {status.problem === 'currency'
              ? t('data.problems.currency')
              : t(`data.problems.${status.problem}`)}
          </span>
        )
      case 'installment': {
        const plan = transactions.get(status.planId)
        return t('data.statement.planMonth', {
          month: status.month,
          months: status.months,
          name: (plan?.payeeId ? payees.get(plan.payeeId) : undefined) ?? words.label(item),
        })
      }
      case 'duplicate':
        return duplicateText(item)
      case 'merge': {
        const match = transactions.get(status.matchId)
        return t('data.statement.logged', { date: words.date(match?.date ?? null) })
      }
      default:
        return words.date(row.date)
    }
  }

  return (
    <>
      <Example {...props} onFixLayout={props.onFixLayout} />
      {!wide && <Balance {...props} onFind={props.onFind} />}
      {props.updates.length > 0 && wallet && (
        <List inset>
          <ListButtonRow
            tone="text"
            leading={<IconTile icon={walletIconComponents[wallet.icon]} color={wallet.color} />}
            title={t('data.statement.update', { wallet: wallet.name })}
            subtitle={t('data.statement.differ', { count: props.updates.length })}
            onClick={props.onUpdate}
          />
        </List>
      )}
      {wide && <Balance {...props} onFind={props.onFind} />}

      {lookAtRows.length > 0 && (
        <List inset label={`${t('data.statement.toLookAt')} · ${String(lookAtRows.length)}`}>
          {lookAtRows.map((item) =>
            item.status.kind === 'transfer' ? (
              <ChoiceRow
                key={item.row.line}
                role="switch"
                title={words.label(item)}
                subtitle={t('data.statement.transfer')}
                checked={!decisions.apart.has(item.row.line)}
                onToggle={() => {
                  const apart = new Set(decisions.apart)
                  if (apart.has(item.row.line)) apart.delete(item.row.line)
                  else apart.add(item.row.line)
                  props.onDecisions({ ...decisions, apart })
                }}
              />
            ) : (
              <ListButtonRow
                key={item.row.line}
                tone="text"
                title={words.label(item)}
                subtitle={reason(item)}
                trailing={<span className="text-text">{words.amount(item)}</span>}
                onClick={() => {
                  props.onRow(item)
                }}
              />
            ),
          )}
        </List>
      )}
      {already.length > 0 && (
        <>
          <List inset label={`${t('data.statement.already')} · ${String(already.length)}`}>
            {already.map((item) =>
              item.status.kind === 'duplicate' ? (
                <ChoiceRow
                  key={item.row.line}
                  role="switch"
                  title={`${words.label(item)} · ${words.money.text({ minor: Math.abs(item.row.amount ?? 0), currency: item.row.currency })}`}
                  subtitle={duplicateText(item)}
                  checked={decisions.keep.has(item.row.line)}
                  onToggle={() => {
                    const keep = new Set(decisions.keep)
                    if (keep.has(item.row.line)) keep.delete(item.row.line)
                    else keep.add(item.row.line)
                    props.onDecisions({ ...decisions, keep })
                  }}
                />
              ) : (
                <ListRow
                  key={item.row.line}
                  title={words.label(item)}
                  subtitle={reason(item)}
                  trailing={<span className="text-text">{words.amount(item)}</span>}
                />
              ),
            )}
          </List>
          {already.some((item) => item.status.kind === 'duplicate') && (
            <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">
              {t('data.review.duplicatesNote')}
            </p>
          )}
        </>
      )}
      {ready.length > 0 && (
        <List
          inset
          label={`${t('data.statement.ready')} · ${String(ready.length)}`}
          detail={
            summary.spent > 0
              ? words.money.text({ minor: summary.spent, currency: ready[0]?.row.currency ?? '' })
              : undefined
          }
        >
          {(allReady ? ready : ready.slice(0, shownRows)).map((item) => (
            <ListButtonRow
              key={item.row.line}
              tone="text"
              title={words.label(item)}
              subtitle={[
                decisions.ignore?.has(item.row.line) ? t('data.statement.leftOut') : '',
                words.date(item.row.date),
                words.category(item),
              ]
                .filter(Boolean)
                .join(' · ')}
              trailing={<span className="text-text">{words.amount(item)}</span>}
              onClick={() => {
                props.onRow(item)
              }}
            />
          ))}
          {!allReady && ready.length > shownRows && (
            <ListButtonRow
              title={t('data.review.more', { count: ready.length - shownRows })}
              onClick={() => {
                setAllReady(true)
              }}
            />
          )}
        </List>
      )}
    </>
  )
}

/**
 * IMP-40: one row as an example, its fields boxed on the page and named, so the person
 * sees at a glance how every row was read; fixing the layout fixes them all (IMP-14).
 */
function Example(props: ReviewProps & { onFixLayout: () => void }) {
  const { t } = useTranslation()
  const { file, planned, ledger } = props
  const example =
    planned.find((item) => item.status.kind === 'ready' && sourceOf(file, item.row.line)) ??
    planned.find((item) => sourceOf(file, item.row.line))
  const found = example ? sourceOf(file, example.row.line) : null
  const clean = planned.filter(
    ({ status }) => status.kind !== 'check' && status.kind !== 'unreadable',
  ).length
  const marks = planned.some(({ row }) => row.installment)
  const wallet = ledger.wallets.find((item) => item.id === props.walletId)
  const fieldBoxes: PageBox[] = []
  if (found) {
    const fields = fieldsOf(found.source, props.settings)
    for (const key of ['date', 'payee', 'amount', 'installment'] as const) {
      const box = fields[key]
      if (box)
        fieldBoxes.push({
          key,
          box,
          tone: key === 'installment' ? 'dashed' : 'brand',
          tag: t(`data.statement.fields.${key}`),
        })
    }
  }
  return (
    <section className="flex flex-col gap-2.5 rounded-2xl bg-inset p-3">
      {found && (
        // Room above for the tags, and the rows around it for context.
        <PagePart
          className="mt-4"
          image={found.image}
          region={rowRegion(
            found.source.box,
            fieldBoxes.map((item) => item.box),
            2.5,
          )}
          boxes={fieldBoxes}
        />
      )}
      <div className="flex flex-col gap-0.5 px-1">
        <p className="text-[0.9375rem] text-text">
          {props.remembered && wallet
            ? t('data.statement.readLikeLast', { wallet: wallet.name })
            : t('data.statement.allLikeThis', { count: clean })}
        </p>
        {marks && (
          <p className="text-[0.8125rem] text-text-muted">{t('data.statement.marksNote')}</p>
        )}
        <button
          type="button"
          onClick={props.onFixLayout}
          className="-mx-1 mt-0.5 self-start rounded-lg px-1 py-2 text-[0.9375rem] text-brand focus-visible:outline-2 focus-visible:outline-brand"
        >
          {t('data.statement.fixLayout')}
        </button>
      </div>
    </section>
  )
}

function Balance(props: ReviewProps & { onFind: () => void }) {
  const { t } = useTranslation()
  const wide = useMediaQuery('(min-width: 1024px)')
  const currency = props.planned[0]?.row.currency ?? props.ledger.defaultCurrency
  const money = useMoney(currency)
  const result = balanceOff(
    props.file,
    props.settings,
    props.planned,
    currency,
    props.decisions.ignore,
  )
  if (!result) return null
  const ending = money.text({ minor: Math.abs(result.end), currency })
  return (
    <div className="flex items-start gap-2 px-4 text-[0.8125rem] text-text-muted">
      {result.off === 0 ? (
        <>
          <span className="mt-px grid size-[1.125rem] shrink-0 place-items-center rounded-full bg-brand text-on-brand">
            <CheckIcon aria-hidden weight="bold" className="size-[0.6875rem]" />
          </span>
          <p>{t('data.review.balanceMatches', { amount: ending })}</p>
        </>
      ) : (
        <p>
          <span className="text-warning">
            {t('data.review.balanceDiffers', {
              amount: ending,
              difference: money.text({ minor: result.off, currency }),
            })}
          </span>{' '}
          {wide ? (
            t('data.statement.findWide')
          ) : (
            <button
              type="button"
              onClick={props.onFind}
              className="inline-flex min-h-11 items-center text-brand focus-visible:outline-2 focus-visible:outline-brand"
            >
              {t('data.statement.find')}
            </button>
          )}
        </p>
      )}
    </div>
  )
}

/**
 * IMP-40: every page with every row boxed and tagged with what happens to it. Tapping
 * a row checks it; drawing a box around one the reader missed adds it.
 */
function StatementView(
  props: ReviewProps & {
    onRow: (item: PlannedRow) => void
    onDrawn: (page: number, box: Box) => void
  },
) {
  const { t } = useTranslation()
  const [drawing, setDrawing] = useState(false)
  const { file, planned, decisions } = props
  const pages = file.pages ?? []
  const facts = file.table.facts
  const factBoxes = (page: number): PageBox[] =>
    facts
      ? (
          [
            ['balance', facts.balance],
            ['due', facts.due],
            ['minimum', facts.minimum],
            ['limit', facts.limit],
            ['closing', facts.closing],
          ] as const
        ).flatMap(([key, fact]) =>
          fact?.page === page
            ? [
                {
                  key,
                  box: fact.box,
                  tone: 'muted' as const,
                  tag: t(`data.statement.facts.${key}`),
                  // The facts sit on lines close together, so each tag goes after its box.
                  tagAt: 'end' as const,
                },
              ]
            : [],
        )
      : []
  const rowBoxes = (page: number): PageBox[] =>
    planned.flatMap((item) => {
      const source = file.table.sources[item.row.line - 2]
      if (source?.page !== page) return []
      const { status, row } = item
      const left = decisions.ignore?.has(row.line)
      const tag = left
        ? t('data.statement.tags.left')
        : status.kind === 'check' || status.kind === 'unreadable'
          ? t('data.statement.tags.hard')
          : status.kind === 'plan'
            ? t('data.statement.tags.plan', { month: status.month, months: status.months })
            : status.kind === 'duplicate' && !decisions.keep.has(row.line)
              ? t('data.statement.tags.in')
              : status.kind === 'installment' || status.kind === 'merge'
                ? t('data.statement.tags.in')
                : undefined
      const tone =
        status.kind === 'check' || status.kind === 'unreadable'
          ? ('warning' as const)
          : tag === t('data.statement.tags.in') || left
            ? ('muted' as const)
            : ('brand' as const)
      return [
        {
          key: `row-${String(row.line)}`,
          box: source.box,
          tone,
          ...(tag ? { tag } : {}),
          label: `${row.payee || t('data.review.row', { line: row.line })}${tag ? ` · ${tag}` : ''}`,
          ...(drawing
            ? {}
            : {
                onClick: () => {
                  props.onRow(item)
                },
              }),
        },
      ]
    })

  return (
    <>
      {/* "Fix how it's read" sits with the example beside it, on both sizes. */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          aria-pressed={drawing}
          onClick={() => {
            setDrawing(!drawing)
          }}
          className={`flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[0.9375rem] font-semibold focus-visible:outline-2 focus-visible:outline-brand ${drawing ? 'bg-brand text-on-brand' : 'bg-[color-mix(in_srgb,var(--color-brand)_14%,var(--color-surface))] text-brand'}`}
        >
          <SelectionPlusIcon aria-hidden className="size-5" />
          {drawing ? t('data.statement.drawing') : t('data.statement.draw')}
        </button>
      </div>
      {drawing && (
        <p className="px-1 text-[0.8125rem] text-text-muted">{t('data.statement.drawHint')}</p>
      )}
      {pages.length === 0 || pages.every((page) => page === null) ? (
        <p className="px-1 text-[0.8125rem] text-text-muted">{t('data.statement.noPicture')}</p>
      ) : (
        pages.map((image, index) =>
          image ? (
            <DrawablePage
              key={image.url}
              drawing={drawing}
              onDrawn={(box) => {
                setDrawing(false)
                props.onDrawn(index, box)
              }}
            >
              <PagePart
                image={image}
                boxes={[...factBoxes(index), ...rowBoxes(index)]}
                className="shadow-[0_1px_4px_rgb(0_0_0/10%)]"
              />
            </DrawablePage>
          ) : null,
        )
      )}
    </>
  )
}

/** While drawing, a drag over the page makes a box, in fractions of the page. */
function DrawablePage({
  drawing,
  onDrawn,
  children,
}: {
  drawing: boolean
  onDrawn: (box: Box) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const at = (event: ReactPointerEvent) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }
  const between = (a: { x: number; y: number }, b: { x: number; y: number }): Box => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  })
  return (
    <div ref={ref} className="relative">
      {children}
      {drawing && (
        <div
          className="absolute inset-0 cursor-crosshair touch-none"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            const point = at(event)
            setStart(point)
            setBox({ ...point, width: 0, height: 0 })
          }}
          onPointerMove={(event) => {
            if (start) setBox(between(start, at(event)))
          }}
          onPointerUp={(event) => {
            if (!start) return
            const drawn = between(start, at(event))
            setStart(null)
            setBox(null)
            // A tap rather than a drag draws nothing.
            if (drawn.width > 0.02 && drawn.height > 0.005) onDrawn(drawn)
          }}
        >
          {box && (
            <span
              aria-hidden
              className="absolute rounded-[3px] border-2 border-brand bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)]"
              style={{
                left: `${String(box.x * 100)}%`,
                top: `${String(box.y * 100)}%`,
                width: `${String(box.width * 100)}%`,
                height: `${String(box.height * 100)}%`,
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
