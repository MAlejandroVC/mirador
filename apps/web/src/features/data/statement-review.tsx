import { toCalendarDate } from '@repo/core'
import {
  type Box,
  type CategoryLink,
  type ColumnSettings,
  type Decisions,
  type FactKey,
  factKeys,
  fieldsOf,
  type PlannedRow,
  type StatementFact,
  type StatementTable,
  summarize,
  type WalletLink,
  type WalletUpdate,
} from '@repo/import'
import { type ReactNode, useEffect, useRef, useState } from 'react'
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
import { importCount, rowRegion, sourceOf, statementChecks } from './statement-model'
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
  /** IMP-37: a total or date shown by a box, and the words beside it, to look for next time. */
  onFact: (key: FactKey, fact: StatementFact, label: string) => void
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
  const walletNames = new Map(props.ledger.wallets.map((wallet) => [wallet.id, wallet.name]))
  return {
    money,
    today,
    label: (item: PlannedRow) =>
      item.row.payee || item.row.note || t('data.review.row', { line: item.row.line }),
    // DL-NUM-03, DL-COL-07: an expense has no sign; money in is Moss with a plus.
    amount: (item: PlannedRow) => {
      const minor = item.row.amount ?? 0
      const value = { minor: Math.abs(minor), currency: item.row.currency }
      // DL-NUM-03: money moved between the person's own wallets is muted, unsigned.
      if (item.transfer)
        return <Amount tone="muted" parts={money.parts(value)} label={money.text(value)} />
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
    /** IMP-09: where a transfer's money came from or went. */
    transfer: (item: PlannedRow) => {
      if (!item.transfer) return ''
      const wallet = walletNames.get(item.transfer.walletId) ?? ''
      if (item.transfer.guessed) return t('data.statement.paymentFrom', { wallet })
      return (item.row.amount ?? 0) > 0
        ? t('data.statement.transferFrom', { wallet })
        : t('data.statement.transferTo', { wallet })
    },
    category: (item: PlannedRow) => {
      if (item.transfer) return ''
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

  // IMP-09: a payment taken for a transfer is a guess, so it is shown to look at.
  const toLookAt = planned.filter(
    ({ status, transfer }) =>
      ['check', 'plan', 'noCategory', 'unreadable', 'transfer'].includes(status.kind) ||
      (status.kind === 'ready' && transfer?.guessed),
  )
  const already = planned.filter(({ status }) =>
    ['duplicate', 'installment', 'merge'].includes(status.kind),
  )
  const ready = planned.filter(
    ({ status, transfer }) => status.kind === 'ready' && !transfer?.guessed,
  )
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
    if (item.transfer && status.kind === 'ready') return words.transfer(item)
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
        // IMP-31: once picked, the row says where it goes.
        return words.category(item) || t('data.statement.needsCategory')
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
      {!wide && <Checks {...props} onFind={props.onFind} />}
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
      {wide && <Checks {...props} onFind={props.onFind} />}

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
                words.transfer(item) || words.category(item),
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

/**
 * IMP-37: whether the rows add up to what the statement says: its total charges, its
 * total payments and deposits, and its ending balance. What matches is said once; what
 * doesn't is said in `warning` (DL-COL-05), with a way to find the row on the page.
 */
function Checks(props: ReviewProps & { onFind: () => void }) {
  const { t } = useTranslation()
  const wide = useMediaQuery('(min-width: 1024px)')
  const currency = props.planned[0]?.row.currency ?? props.ledger.defaultCurrency
  const money = useMoney(currency)
  const checks = statementChecks(
    props.file,
    props.settings,
    props.planned,
    currency,
    props.decisions.ignore,
  )
  const find = (label: string) =>
    wide ? (
      <span>{t('data.statement.findWide')}</span>
    ) : (
      <button
        type="button"
        onClick={props.onFind}
        className="inline-flex min-h-11 items-center text-brand focus-visible:outline-2 focus-visible:outline-brand"
      >
        {label}
      </button>
    )
  // Nothing to check against yet: the totals can be shown by drawing a box.
  if (checks.length === 0)
    return (
      <p className="px-4 text-[0.8125rem] text-text-muted">
        {t('data.review.checks.none')} {!wide && find(t('data.review.checks.showTotals'))}
      </p>
    )
  const amount = (minor: number) => money.text({ minor, currency })
  const matched = checks.filter((check) => check.off === 0)
  const differ = checks.filter((check) => check.off !== 0)
  const list = new Intl.ListFormat(money.locale, { type: 'conjunction' })
  return (
    <div className="flex flex-col gap-1.5 px-4 text-[0.8125rem] text-text-muted">
      {matched.length > 0 && (
        <div className="flex items-start gap-2">
          <span className="mt-px grid size-[1.125rem] shrink-0 place-items-center rounded-full bg-brand text-on-brand">
            <CheckIcon aria-hidden weight="bold" className="size-[0.6875rem]" />
          </span>
          <p>
            {t('data.review.checks.match', {
              list: list.format(
                matched.map((check) =>
                  t(`data.review.checks.item.${check.kind}`, { amount: amount(check.expected) }),
                ),
              ),
            })}
          </p>
        </div>
      )}
      {differ.length > 0 && (
        <p>
          {differ.map((check) => (
            <span key={check.kind} className="block text-warning">
              {t(`data.review.checks.differ.${check.kind}`, {
                amount: amount(check.expected),
                difference: amount(check.off),
              })}
            </span>
          ))}
          {find(t('data.statement.find'))}
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
  const touch = useMediaQuery('(pointer: coarse)')
  const { file, planned, decisions } = props
  const pages = file.pages ?? []
  const facts = file.table.facts
  const factBoxes = (page: number): PageBox[] =>
    facts
      ? factKeys
          .map((key) => [key, facts[key]] as const)
          .flatMap(([key, fact]) =>
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
      {/* "Fix how it's read" sits with the example beside it, on both sizes. Drawing
          stays a tap away however far down the statement is scrolled. */}
      <div className="sticky top-[var(--sheet-bar-height,0px)] z-10 -mx-1 flex items-center justify-end gap-3 bg-surface/95 px-1 py-1.5 lg:top-0 lg:-mx-3 lg:-mt-3 lg:bg-inset/95 lg:px-3 lg:pt-3">
        {drawing && (
          <p className="min-w-0 flex-1 text-[0.8125rem] text-text-muted">
            {touch ? t('data.statement.drawHint') : t('data.statement.drawHintMouse')}
          </p>
        )}
        <button
          type="button"
          aria-pressed={drawing}
          onClick={() => {
            setDrawing(!drawing)
          }}
          className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[0.9375rem] font-semibold focus-visible:outline-2 focus-visible:outline-brand ${drawing ? 'bg-brand text-on-brand' : 'bg-[color-mix(in_srgb,var(--color-brand)_14%,var(--color-surface))] text-brand'}`}
        >
          <SelectionPlusIcon aria-hidden className="size-5" />
          {drawing ? t('data.statement.drawing') : t('data.statement.draw')}
        </button>
      </div>
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

// How long a finger rests before a drag draws instead of scrolling, and how far it may
// wander meanwhile (DL-VIZ-05 uses the same touch and hold on charts).
const holdMs = 350
const slopPx = 8

/**
 * IMP-40: while drawing, a box made over the page, in fractions of it. With a mouse a
 * drag draws. With a finger a drag still scrolls, so the whole statement stays in
 * reach; touching and holding, then dragging, draws.
 */
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
  const [box, setBox] = useState<Box | null>(null)
  const gesture = useRef<{
    start: { x: number; y: number }
    client: { x: number; y: number }
    timer: number | undefined
    active: boolean
  } | null>(null)
  // Once a box is being drawn the page must not scroll under the finger. Only a
  // listener that isn't passive can stop it, so React's onTouchMove won't do.
  useEffect(() => {
    const element = ref.current
    if (!element || !drawing) return
    const hold = (event: TouchEvent) => {
      if (gesture.current?.active) event.preventDefault()
    }
    element.addEventListener('touchmove', hold, { passive: false })
    return () => {
      element.removeEventListener('touchmove', hold)
    }
  }, [drawing])
  const at = (event: { clientX: number; clientY: number }) => {
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
  const stop = () => {
    window.clearTimeout(gesture.current?.timer)
    gesture.current = null
    setBox(null)
  }
  return (
    <div ref={ref} className="relative">
      {children}
      {drawing && (
        <div
          className="absolute inset-0 cursor-crosshair touch-pan-y select-none [-webkit-touch-callout:none]"
          onContextMenu={(event) => {
            event.preventDefault()
          }}
          onPointerDown={(event) => {
            const start = at(event)
            const mouse = event.pointerType === 'mouse'
            if (mouse) event.currentTarget.setPointerCapture(event.pointerId)
            const current = {
              start,
              client: { x: event.clientX, y: event.clientY },
              timer: undefined as number | undefined,
              active: mouse,
            }
            if (!mouse)
              current.timer = window.setTimeout(() => {
                current.active = true
                setBox({ ...start, width: 0, height: 0 })
              }, holdMs)
            gesture.current = current
            if (mouse) setBox({ ...start, width: 0, height: 0 })
          }}
          onPointerMove={(event) => {
            const current = gesture.current
            if (!current) return
            if (current.active) {
              setBox(between(current.start, at(event)))
              return
            }
            // Moved before the hold: it's a scroll.
            const moved = Math.hypot(
              event.clientX - current.client.x,
              event.clientY - current.client.y,
            )
            if (moved > slopPx) stop()
          }}
          onPointerUp={(event) => {
            const current = gesture.current
            if (!current?.active) {
              stop()
              return
            }
            const drawn = between(current.start, at(event))
            stop()
            // A tap rather than a drag draws nothing.
            if (drawn.width > 0.02 && drawn.height > 0.005) onDrawn(drawn)
          }}
          onPointerCancel={stop}
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
