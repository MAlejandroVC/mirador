import { walletPresets } from '@repo/api'
import { fractionDigits, parseAmount } from '@repo/core'
import {
  type CategoryLink,
  type ColumnField,
  type ColumnSettings,
  columnFields,
  defaultDecisions,
  type Decisions,
  missingFields,
  type PlannedRow,
  summarize,
  type WalletLink,
} from '@repo/import'
import { useNavigate } from '@tanstack/react-router'
import { type ReactNode, use, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Alert } from '../../components/ui/alert'
import { Amount } from '../../components/ui/amount'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { MoneyRow } from '../../components/ui/field-row'
import { IconTile } from '../../components/ui/icon-tile'
import { ArrowRightIcon, CheckIcon, FileTextIcon } from '../../components/ui/icons'
import { List, ListButtonRow, ListRow } from '../../components/ui/list'
import { Sheet } from '../../components/ui/sheet'
import { roundButton, SheetActionSlot } from '../../components/ui/sheet-action'
import { formatShortDate, useMoney } from '../../lib/format'
import { CategoryPicker } from '../categories/category-picker'
import { CategoryTile } from '../categories/category-tile'
import { newId, type Ledger, useSaveRecords } from '../wallets/use-ledger'
import { walletIconComponents } from '../wallets/wallet-look'
import {
  buildChanges,
  currencyOf,
  fallbackWallet,
  type ImportFile,
  links,
  owes,
  plan,
  startingSettings,
} from './import-model'

// IMP-01 to IMP-34, DAT-12: importing a CSV in three steps in one sheet: what each
// column holds, where its wallets and categories go, then a review that asks only about
// the rows Mirador isn't sure of (IMP-30, IMP-31). A file whose columns were seen before
// starts at the second step (IMP-03).

type Step = 'columns' | 'match' | 'review' | 'done'

export interface ImportDone {
  batchId: string
  imported: number
  skipped: number
  merged: number
  waiting: number
  wallets: number
}

export function ImportSheet({
  file,
  ledger,
  onClose,
  onUndo,
}: {
  file: ImportFile | null
  ledger: Ledger
  onClose: () => void
  onUndo: (batchId: string) => void
}) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('columns')
  const [back, setBack] = useState<(() => void) | null>(null)
  return (
    <Sheet
      open={file !== null}
      title={t(`data.steps.${step}`)}
      cancelLabel={t('nav.cancel')}
      {...(back ? { back: { label: t('nav.back'), onClick: back } } : {})}
      onClose={onClose}
    >
      {file && (
        <ImportFlow
          key={file.fingerprint}
          file={file}
          ledger={ledger}
          onStep={(next, goBack) => {
            setStep(next)
            setBack(() => goBack)
          }}
          onClose={onClose}
          onUndo={onUndo}
        />
      )}
    </Sheet>
  )
}

function ImportFlow({
  file,
  ledger,
  onStep,
  onClose,
  onUndo,
}: {
  file: ImportFile
  ledger: Ledger
  onStep: (step: Step, back: (() => void) | null) => void
  onClose: () => void
  onUndo: (batchId: string) => void
}) {
  const { t } = useTranslation()
  // The ledger changes while saving; the flow keeps the settings it started with.
  const [start] = useState(() => startingSettings(file, ledger))
  const [settings, setSettings] = useState<ColumnSettings>(start.settings)
  const [remember, setRemember] = useState(true)
  const [step, setStepState] = useState<Step>(start.profileId ? 'match' : 'columns')
  const setStep = (next: Step) => {
    setStepState(next)
    onStep(next, backFrom(next))
  }
  const backFrom = (from: Step): (() => void) | null =>
    from === 'match'
      ? () => {
          setStep('columns')
        }
      : from === 'review'
        ? () => {
            setStep('match')
          }
        : null
  // The sheet's bar shows where the flow starts (IMP-03 may skip the first step).
  useEffect(() => {
    onStep(step, backFrom(step))
    // Once, for the step the flow opens on; later steps report themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [walletId] = useState(() => fallbackWallet(ledger, start.walletId))
  const [linked, setLinked] = useState(() =>
    start.profileId ? links(file, start.settings, ledger, walletId) : null,
  )
  const [decisions, setDecisions] = useState<Decisions | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [done, setDone] = useState<ImportDone | null>(null)
  const save = useSaveRecords()

  const planned = useMemo(
    () => (linked ? plan(file, settings, ledger, linked.wallets) : []),
    [file, settings, ledger, linked],
  )

  const toMatch = () => {
    const needed = missingFields(settings.columns)
    setMissing(needed)
    if (needed.length > 0) return
    setLinked(links(file, settings, ledger, walletId))
    setStep('match')
  }
  const toReview = () => {
    setDecisions(defaultDecisions(plan(file, settings, ledger, linked?.wallets ?? [])))
    setStep('review')
  }
  const commit = () => {
    if (!linked || !decisions) return
    const { changes, batch, batchId } = buildChanges({
      planned,
      wallets: linked.wallets,
      categories: linked.categories,
      decisions,
      ledger,
      file: { name: file.name, fingerprint: file.fingerprint, source: 'csv' },
      names: { wallet: t('data.match.importedName'), group: t('data.match.importedName') },
      ...(remember
        ? {
            profile: {
              id: start.profileId,
              header: file.table.header,
              settings,
              walletId:
                linked.wallets.find((w) => w.name === '')?.target.kind === 'existing'
                  ? (linked.wallets.find((w) => w.name === '')?.target as { id: string }).id
                  : null,
            },
          }
        : {}),
      newId,
    })
    save.mutate(changes, {
      onSuccess: () => {
        setDone({
          batchId,
          imported: batch.imported,
          skipped: batch.skipped - batch.waiting.length,
          merged: batch.merged.length,
          waiting: batch.waiting.length,
          wallets: new Set(
            linked.wallets.map((w) => (w.target.kind === 'existing' ? w.target.id : w.name)),
          ).size,
        })
        setStep('done')
      },
    })
  }

  return (
    <StepBar
      step={step}
      onNext={step === 'columns' ? toMatch : step === 'match' ? toReview : undefined}
    >
      {step === 'columns' && (
        <ColumnsStep
          file={file}
          settings={settings}
          remember={remember}
          missing={missing}
          onChange={(next) => {
            setSettings(next)
            setMissing([])
          }}
          onRemember={setRemember}
        />
      )}
      {step === 'match' && linked && (
        <MatchStep
          ledger={ledger}
          wallets={linked.wallets}
          categories={linked.categories}
          onWallets={(wallets) => {
            setLinked({ ...linked, wallets })
          }}
          onCategories={(categories) => {
            setLinked({ ...linked, categories })
          }}
        />
      )}
      {step === 'review' && linked && decisions && (
        <ReviewStep
          ledger={ledger}
          planned={planned}
          wallets={linked.wallets}
          decisions={decisions}
          saving={save.isPending}
          failed={save.isError}
          onDecisions={setDecisions}
          onImport={commit}
        />
      )}
      {step === 'done' && done && (
        <DoneStep
          done={done}
          onClose={onClose}
          onUndo={() => {
            onUndo(done.batchId)
          }}
        />
      )}
    </StepBar>
  )
}

/**
 * DL-CMP-08: the steps share the sheet's bar: its title names the step, back replaces
 * the X past the first, and the next step is the round button at the top right, an
 * arrow until the review, which ends with its own Import button.
 */
function StepBar({
  step,
  onNext,
  children,
}: {
  step: Step
  onNext: (() => void) | undefined
  children: ReactNode
}) {
  const { t } = useTranslation()
  const slot = use(SheetActionSlot)
  const number = { columns: 1, match: 2, review: 3, done: 3 }[step]
  return (
    <>
      {slot &&
        onNext &&
        createPortal(
          <button
            type="button"
            aria-label={t('data.steps.next')}
            onClick={onNext}
            className={`${roundButton} bg-brand text-on-brand`}
          >
            <ArrowRightIcon aria-hidden weight="bold" className="size-5" />
          </button>,
          slot,
        )}
      {step !== 'done' && (
        <p className="-mt-2.5 text-center text-xs text-text-muted">
          {t('data.steps.count', { step: number })}
        </p>
      )}
      {children}
    </>
  )
}

function ColumnsStep({
  file,
  settings,
  remember,
  missing,
  onChange,
  onRemember,
}: {
  file: ImportFile
  settings: ColumnSettings
  remember: boolean
  missing: string[]
  onChange: (settings: ColumnSettings) => void
  onRemember: (remember: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const [picking, setPicking] = useState<number | null>(null)
  const [choosing, setChoosing] = useState<'dates' | 'amounts' | null>(null)
  const sample = (index: number) =>
    file.table.rows.find((row) => (row[index] ?? '').trim() !== '')?.[index]?.trim() ?? ''
  const hasAmount = settings.columns.includes('amount')
  const rows = file.table.rows.length

  return (
    <>
      <List inset>
        <ListRow
          leading={<IconTile icon={FileTextIcon} />}
          title={file.name}
          subtitle={t('data.rows', { count: rows })}
        />
      </List>
      {missing.length > 0 && (
        <Alert>{missing.map((field) => t(`data.columns.missing.${field}`)).join(' ')}</Alert>
      )}
      <List inset label={t('data.columns.what')}>
        {file.table.header.map((name, index) => {
          const field = settings.columns[index] ?? 'skip'
          return (
            <ListButtonRow
              key={`${name}-${String(index)}`}
              tone="text"
              title={name || t('data.columns.unnamed', { number: index + 1 })}
              subtitle={sample(index) || t('data.columns.empty')}
              trailing={
                <span
                  className={`text-[0.9375rem] ${field === 'skip' ? 'text-text-faint' : 'text-brand'}`}
                >
                  {t(`data.fields.${field}`)}
                </span>
              }
              onClick={() => {
                setPicking(index)
              }}
            />
          )
        })}
      </List>
      <List inset label={t('data.columns.howToRead')}>
        <ListButtonRow
          tone="text"
          title={t('data.columns.dates')}
          trailing={
            <span className="text-[0.9375rem] text-brand">
              {t(`data.dateOrders.${settings.dateOrder}`)}
            </span>
          }
          onClick={() => {
            setChoosing('dates')
          }}
        />
        {hasAmount && (
          <ListButtonRow
            tone="text"
            title={t('data.columns.amounts')}
            trailing={
              <span className="text-[0.9375rem] text-brand">
                {t(`data.signs.${settings.amountSign}`)}
              </span>
            }
            onClick={() => {
              setChoosing('amounts')
            }}
          />
        )}
      </List>
      <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">{t('data.columns.guessed')}</p>
      <List inset>
        <ChoiceRow
          role="switch"
          title={t('data.columns.remember')}
          subtitle={t('data.columns.rememberHint')}
          checked={remember}
          onToggle={() => {
            onRemember(!remember)
          }}
        />
      </List>

      <Sheet
        open={picking !== null}
        title={file.table.header[picking ?? 0] ?? ''}
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          setPicking(null)
        }}
      >
        <List inset>
          {columnFields.map((field) => (
            <ChoiceRow
              key={field}
              role="radio"
              title={t(`data.fields.${field}`)}
              checked={picking !== null && settings.columns[picking] === field}
              onToggle={() => {
                if (picking === null) return
                // A field holds one column, so choosing it again moves it here.
                const columns: ColumnField[] = settings.columns.map((current, index) =>
                  index === picking
                    ? field
                    : field !== 'skip' && current === field
                      ? 'skip'
                      : current,
                )
                onChange({ ...settings, columns })
                setPicking(null)
              }}
            />
          ))}
        </List>
      </Sheet>
      <Sheet
        open={choosing !== null}
        title={choosing === 'amounts' ? t('data.columns.amounts') : t('data.columns.dates')}
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          setChoosing(null)
        }}
      >
        <List inset>
          {choosing === 'amounts'
            ? (['negativeIsExpense', 'positiveIsExpense'] as const).map((sign) => (
                <ChoiceRow
                  key={sign}
                  role="radio"
                  title={t(`data.signs.${sign}`)}
                  subtitle={t(`data.signs.${sign}Example`)}
                  checked={settings.amountSign === sign}
                  onToggle={() => {
                    onChange({ ...settings, amountSign: sign })
                    setChoosing(null)
                  }}
                />
              ))
            : (['dmy', 'mdy', 'ymd'] as const).map((order) => (
                <ChoiceRow
                  key={order}
                  role="radio"
                  title={t(`data.dateOrders.${order}`)}
                  subtitle={
                    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
                      new Date(2026, 2, 25),
                    ) + ` · ${{ dmy: '25/03/2026', mdy: '03/25/2026', ymd: '2026-03-25' }[order]}`
                  }
                  checked={settings.dateOrder === order}
                  onToggle={() => {
                    onChange({ ...settings, dateOrder: order })
                    setChoosing(null)
                  }}
                />
              ))}
        </List>
      </Sheet>
    </>
  )
}

// How many categories show before "All N categories".
const shownCategories = 8

function MatchStep({
  ledger,
  wallets,
  categories,
  onWallets,
  onCategories,
}: {
  ledger: Ledger
  wallets: readonly WalletLink[]
  categories: readonly CategoryLink[]
  onWallets: (wallets: WalletLink[]) => void
  onCategories: (categories: CategoryLink[]) => void
}) {
  const { t } = useTranslation()
  const money = useMoney(ledger.defaultCurrency)
  const [walletPick, setWalletPick] = useState<number | null>(null)
  const [categoryPick, setCategoryPick] = useState<number | null>(null)
  const [pickingExisting, setPickingExisting] = useState(false)
  const [allShown, setAllShown] = useState(false)
  const [balances, setBalances] = useState<Record<number, string>>({})
  const groups = new Map(ledger.groups.map((group) => [group.id, group]))
  const byId = new Map(ledger.categories.map((category) => [category.id, category]))
  const active = ledger.wallets.filter((wallet) => wallet.active)

  const setWallet = (index: number, target: WalletLink['target']) => {
    onWallets(wallets.map((link, i) => (i === index ? { ...link, target } : link)))
  }
  const setCategory = (index: number, target: CategoryLink['target']) => {
    onCategories(categories.map((link, i) => (i === index ? { ...link, target } : link)))
  }
  const newTarget = (
    link: WalletLink,
    preset = link.target.kind === 'new' ? link.target.preset : 'generic',
  ) => ({
    kind: 'new' as const,
    name: link.name,
    preset,
    currency: link.target.kind === 'new' ? link.target.currency : ledger.defaultCurrency,
    balanceToday: link.target.kind === 'new' ? link.target.balanceToday : null,
  })
  const pickedWallet = walletPick === null ? null : wallets[walletPick]
  const pickedCategory = categoryPick === null ? null : categories[categoryPick]

  return (
    <>
      <List inset label={t('data.match.wallets')}>
        {wallets.flatMap((link, index) => {
          const existing =
            link.target.kind === 'existing'
              ? ledger.wallets.find((wallet) => wallet.id === (link.target as { id: string }).id)
              : undefined
          const icon = existing ? walletIconComponents[existing.icon] : walletIconComponents.wallet
          const row = (
            <ListButtonRow
              key={`w${String(index)}`}
              tone="text"
              leading={<IconTile icon={icon} {...(existing ? { color: existing.color } : {})} />}
              title={link.name || t('data.match.allRows')}
              subtitle={t('data.rows', { count: link.rows })}
              trailing={
                <span className="flex items-center gap-1.5 text-[0.9375rem] text-brand">
                  {link.target.kind === 'new' && <NewBadge />}
                  {existing?.name ??
                    (link.target.kind === 'new' ? t(`wallets.presets.${link.target.preset}`) : '')}
                </span>
              }
              onClick={() => {
                setWalletPick(index)
              }}
            />
          )
          if (link.target.kind !== 'new') return [row]
          const target = link.target
          const owed = owes(target.preset)
          return [
            row,
            <MoneyRow
              key={`b${String(index)}`}
              label={owed ? t('data.match.owedToday') : t('data.match.balanceToday')}
              value={balances[index] ?? ''}
              locale={money.locale}
              decimals={fractionDigits(target.currency)}
              suffix={target.currency === ledger.defaultCurrency ? undefined : target.currency}
              placeholder="0"
              onChange={(text) => {
                setBalances({ ...balances, [index]: text })
                const amount = parseAmount(text, target.currency, money.locale)
                setWallet(index, {
                  ...target,
                  balanceToday: amount === null ? null : owed ? -amount : amount,
                })
              }}
            />,
          ]
        })}
      </List>
      {wallets.some((link) => link.target.kind === 'new') && (
        <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">
          {t('data.match.walletsNote')}
        </p>
      )}

      {categories.length > 0 && (
        <List inset label={t('data.match.categories')}>
          {(allShown ? categories : categories.slice(0, shownCategories)).map((link, index) => {
            const existing = link.target.kind === 'existing' ? byId.get(link.target.id) : undefined
            return (
              <ListButtonRow
                key={link.key}
                tone="text"
                leading={
                  existing ? (
                    <CategoryTile category={existing} group={groups.get(existing.groupId)} />
                  ) : undefined
                }
                title={link.name}
                subtitle={[link.group, t('data.rows', { count: link.rows })]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  <span className="flex items-center gap-1.5 text-[0.9375rem] text-brand">
                    {existing ? existing.name : <NewBadge />}
                  </span>
                }
                onClick={() => {
                  setCategoryPick(index)
                }}
              />
            )
          })}
          {!allShown && categories.length > shownCategories && (
            <ListButtonRow
              title={t('data.match.allCategories', { count: categories.length })}
              onClick={() => {
                setAllShown(true)
              }}
            />
          )}
        </List>
      )}
      {categories.some((link) => link.target.kind === 'new') && (
        <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">
          {t('data.match.categoriesNote')}
        </p>
      )}

      <Sheet
        open={pickedWallet !== null && pickedWallet !== undefined}
        title={
          pickedWallet?.name === undefined || pickedWallet.name === ''
            ? t('data.match.allRows')
            : pickedWallet.name
        }
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          setWalletPick(null)
        }}
      >
        {pickedWallet && walletPick !== null && (
          <>
            {active.length > 0 && (
              <List inset label={t('data.match.yourWallets')}>
                {active.map((wallet) => (
                  <ChoiceRow
                    key={wallet.id}
                    role="radio"
                    leading={
                      <IconTile icon={walletIconComponents[wallet.icon]} color={wallet.color} />
                    }
                    title={wallet.name}
                    subtitle={wallet.currency}
                    checked={
                      pickedWallet.target.kind === 'existing' &&
                      pickedWallet.target.id === wallet.id
                    }
                    onToggle={() => {
                      setWallet(walletPick, { kind: 'existing', id: wallet.id })
                      setWalletPick(null)
                    }}
                  />
                ))}
              </List>
            )}
            <List inset label={t('data.match.newWallet')}>
              {walletPresets.map((preset) => (
                <ChoiceRow
                  key={preset}
                  role="radio"
                  leading={<IconTile icon={walletIconComponents[presetIcon(preset)]} />}
                  title={t(`wallets.presets.${preset}`)}
                  checked={
                    pickedWallet.target.kind === 'new' && pickedWallet.target.preset === preset
                  }
                  onToggle={() => {
                    setWallet(walletPick, newTarget(pickedWallet, preset))
                    setWalletPick(null)
                  }}
                />
              ))}
            </List>
          </>
        )}
      </Sheet>
      <Sheet
        open={pickedCategory !== null && pickedCategory !== undefined && !pickingExisting}
        title={pickedCategory?.name ?? ''}
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          setCategoryPick(null)
        }}
      >
        {pickedCategory && categoryPick !== null && (
          <List inset>
            <ChoiceRow
              role="radio"
              title={t('data.match.newCategory', { name: pickedCategory.name })}
              subtitle={pickedCategory.group || t('data.match.importedName')}
              checked={pickedCategory.target.kind === 'new'}
              onToggle={() => {
                const group = ledger.groups.find(
                  (g) => g.name.toLowerCase() === pickedCategory.group.toLowerCase(),
                )
                setCategory(categoryPick, {
                  kind: 'new',
                  name: pickedCategory.name,
                  group: group
                    ? { kind: 'existing', id: group.id }
                    : { kind: 'new', name: pickedCategory.group },
                })
                setCategoryPick(null)
              }}
            />
            <ListButtonRow
              title={t('data.match.pickExisting')}
              onClick={() => {
                setPickingExisting(true)
              }}
            />
          </List>
        )}
      </Sheet>
      <CategoryPicker
        open={pickingExisting && pickedCategory !== null && pickedCategory !== undefined}
        ledger={ledger}
        type={pickedCategory?.type ?? 'expense'}
        value={pickedCategory?.target.kind === 'existing' ? pickedCategory.target.id : null}
        onChoose={(category) => {
          if (categoryPick !== null)
            setCategory(categoryPick, { kind: 'existing', id: category.id })
          setPickingExisting(false)
          setCategoryPick(null)
        }}
        onClose={() => {
          setPickingExisting(false)
        }}
      />
    </>
  )
}

function presetIcon(preset: (typeof walletPresets)[number]) {
  return (
    {
      cash: 'money',
      checking: 'bank',
      savings: 'piggyBank',
      investment: 'chartLineUp',
      creditCard: 'creditCard',
      loan: 'handCoins',
      voucher: 'gift',
      generic: 'wallet',
    } as const
  )[preset]
}

function NewBadge() {
  const { t } = useTranslation()
  return (
    <span className="rounded-md bg-[color-mix(in_srgb,var(--color-brand)_14%,var(--color-surface))] px-1.5 py-px text-xs font-semibold text-brand">
      {t('data.match.new')}
    </span>
  )
}

// How many rows of each kind the review shows before "N more".
const shownRows = 4

function ReviewStep({
  ledger,
  planned,
  wallets,
  decisions,
  saving,
  failed,
  onDecisions,
  onImport,
}: {
  ledger: Ledger
  planned: readonly PlannedRow[]
  wallets: readonly WalletLink[]
  decisions: Decisions
  saving: boolean
  failed: boolean
  onDecisions: (decisions: Decisions) => void
  onImport: () => void
}) {
  const { t } = useTranslation()
  const money = useMoney(ledger.defaultCurrency)
  const today = new Date().toISOString().slice(0, 10)
  const summary = summarize(planned)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [picking, setPicking] = useState<PlannedRow | null>(null)
  const byLine = new Map(planned.map((item) => [item.row.line, item]))
  const transactions = new Map(ledger.transactions.map((tx) => [tx.id, tx]))
  const categoryNames = new Map(ledger.categories.map((c) => [c.id, c.name]))
  const walletName = (key: string) => {
    const link = wallets.find((w) => w.name.toLowerCase() === key || (key === '' && w.name === ''))
    if (!link) return key
    if (link.target.kind === 'existing') {
      const id = link.target.id
      return ledger.wallets.find((w) => w.id === id)?.name ?? key
    }
    return link.name || t('data.match.importedName')
  }
  const currency = wallets[0] ? currencyOf(wallets[0], ledger) : ledger.defaultCurrency
  const date = (value: string | null) => (value ? formatShortDate(value, today, money.locale) : '')
  const amount = (item: PlannedRow) =>
    money.text({ minor: Math.abs(item.row.amount ?? 0), currency: item.row.currency })
  const label = (item: PlannedRow) =>
    item.row.payee ||
    item.row.note ||
    item.row.category ||
    t('data.review.row', { line: item.row.line })

  const groups = {
    duplicate: planned.filter((p) => p.status.kind === 'duplicate'),
    transfer: planned.filter((p) => p.status.kind === 'transfer' && p.status.outgoing),
    noCategory: planned.filter((p) => p.status.kind === 'noCategory'),
    unreadable: planned.filter((p) => p.status.kind === 'unreadable'),
  }
  const flagged =
    groups.duplicate.length +
    groups.transfer.length +
    groups.noCategory.length +
    groups.unreadable.length
  // What the button brings in: the confident rows plus the flagged ones as decided.
  const count =
    summary.ready +
    groups.noCategory.length +
    groups.duplicate.filter((p) => decisions.keep.has(p.row.line)).length +
    groups.transfer.reduce((sum, p) => sum + (decisions.apart.has(p.row.line) ? 2 : 1), 0)

  const section = (
    key: keyof typeof groups,
    title: string,
    render: (item: PlannedRow) => ReactNode,
    note?: string,
  ) => {
    const items = groups[key]
    if (items.length === 0) return null
    const all = open.has(key)
    return (
      <>
        <List inset label={`${title} · ${String(items.length)}`}>
          {(all ? items : items.slice(0, shownRows)).map(render)}
          {!all && items.length > shownRows && (
            <ListButtonRow
              title={t('data.review.more', { count: items.length - shownRows })}
              onClick={() => {
                setOpen(new Set([...open, key]))
              }}
            />
          )}
        </List>
        {note && <p className="-mt-1.5 px-4 text-[0.8125rem] text-text-muted">{note}</p>}
      </>
    )
  }

  return (
    <>
      <section className="flex flex-col rounded-2xl bg-inset p-4">
        <span className="text-[2.875rem] leading-none font-semibold tracking-[-0.03em] text-text tabular-nums">
          {new Intl.NumberFormat(money.locale).format(summary.ready + summary.merged)}
        </span>
        <span className="pt-1 text-[0.9375rem] text-text">{t('data.review.readyLine')}</span>
        {summary.ready > 0 && (
          <dl className="mt-3.5 grid grid-cols-2 gap-3 border-t-[0.5px] border-separator pt-3">
            <div>
              <dt className="text-[0.8125rem] text-text-muted">{t('data.review.spent')}</dt>
              <dd>
                <Amount
                  parts={money.parts({ minor: summary.spent, currency })}
                  label={money.text({ minor: summary.spent, currency })}
                />
              </dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] text-text-muted">{t('data.review.earned')}</dt>
              <dd>
                <Amount
                  tone="moss"
                  parts={money.parts({ minor: summary.earned, currency }, 'always')}
                  label={money.text({ minor: summary.earned, currency }, 'always')}
                />
              </dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] text-text-muted">{t('data.review.from')}</dt>
              <dd className="text-[0.9375rem] text-text">{date(summary.from)}</dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] text-text-muted">{t('data.review.to')}</dt>
              <dd className="text-[0.9375rem] text-text">{date(summary.to)}</dd>
            </div>
          </dl>
        )}
      </section>

      {flagged > 0 && (
        <h2 className="-mb-1 px-4 pt-2 text-[1.0625rem] font-semibold text-text">
          {t('data.review.toLookAt', { count: flagged })}
        </h2>
      )}
      {section(
        'duplicate',
        t('data.review.duplicates'),
        (item) => {
          const match =
            item.status.kind === 'duplicate' ? transactions.get(item.status.matchId) : undefined
          return (
            <ChoiceRow
              key={item.row.line}
              role="switch"
              title={`${label(item)} · ${amount(item)}`}
              subtitle={t('data.review.duplicateOf', {
                date: date(item.row.date),
                matchDate: date(match?.date ?? null),
              })}
              checked={decisions.keep.has(item.row.line)}
              onToggle={() => {
                const keep = new Set(decisions.keep)
                if (keep.has(item.row.line)) keep.delete(item.row.line)
                else keep.add(item.row.line)
                onDecisions({ ...decisions, keep })
              }}
            />
          )
        },
        t('data.review.duplicatesNote'),
      )}
      {section(
        'transfer',
        t('data.review.transfers'),
        (item) => {
          const other =
            item.status.kind === 'transfer' ? byLine.get(item.status.pairLine) : undefined
          return (
            <ChoiceRow
              key={item.row.line}
              role="switch"
              title={`${label(item)} · ${amount(item)}`}
              subtitle={`${date(item.row.date)} · ${walletName(item.walletKey)} → ${other ? walletName(other.walletKey) : ''}`}
              checked={!decisions.apart.has(item.row.line)}
              onToggle={() => {
                const apart = new Set(decisions.apart)
                if (apart.has(item.row.line)) apart.delete(item.row.line)
                else apart.add(item.row.line)
                onDecisions({ ...decisions, apart })
              }}
            />
          )
        },
        t('data.review.transfersNote'),
      )}
      {section(
        'noCategory',
        t('data.review.noCategory'),
        (item) => {
          const chosen = decisions.categories.get(item.row.line)
          return (
            <ListButtonRow
              key={item.row.line}
              tone="text"
              title={`${label(item)} · ${amount(item)}`}
              subtitle={date(item.row.date)}
              trailing={
                <span className={`text-[0.9375rem] ${chosen ? 'text-brand' : 'text-text-muted'}`}>
                  {chosen ? categoryNames.get(chosen) : t('data.review.uncategorized')}
                </span>
              }
              onClick={() => {
                setPicking(item)
              }}
            />
          )
        },
        t('data.review.noCategoryNote'),
      )}
      {section(
        'unreadable',
        t('data.review.unreadable'),
        (item) => (
          <ListRow
            key={item.row.line}
            title={t('data.review.row', { line: item.row.line })}
            subtitle={`${item.status.kind === 'unreadable' ? t(`data.problems.${item.status.problem}`) : ''}${item.row.text ? ` · ${item.row.text}` : ''}`}
          />
        ),
        t('data.review.unreadableNote'),
      )}

      {failed && <Alert>{t('data.review.failed')}</Alert>}
      {count === 0 && <Alert tone="warning">{t('data.review.nothing')}</Alert>}
      <Button className="mt-2 w-full" disabled={saving || count === 0} onClick={onImport}>
        {saving ? t('data.review.saving') : t('data.review.import', { count })}
      </Button>

      <CategoryPicker
        open={picking !== null}
        ledger={ledger}
        type={(picking?.row.amount ?? 0) < 0 ? 'expense' : 'income'}
        value={picking ? (decisions.categories.get(picking.row.line) ?? null) : null}
        onChoose={(category) => {
          if (picking) {
            const categories = new Map(decisions.categories)
            categories.set(picking.row.line, category.id)
            onDecisions({ ...decisions, categories })
          }
          setPicking(null)
        }}
        onClose={() => {
          setPicking(null)
        }}
      />
    </>
  )
}

export function DoneStep({
  done,
  onClose,
  onUndo,
}: {
  done: ImportDone
  onClose: () => void
  onUndo: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const sentences = [
    t('data.done.wallets', { count: done.wallets }),
    done.merged > 0 ? t('data.done.merged', { count: done.merged }) : '',
    done.skipped > 0 ? t('data.done.skipped', { count: done.skipped }) : '',
    done.waiting > 0 ? t('data.done.waiting', { count: done.waiting }) : '',
  ].filter(Boolean)
  return (
    <div className="flex flex-col items-center gap-2 px-2 pt-6 pb-2 text-center">
      <span className="mb-2 grid size-[4.5rem] place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand)_14%,var(--color-surface))] text-brand">
        <CheckIcon
          aria-hidden
          weight="bold"
          className="size-9 animate-[check-in_260ms_cubic-bezier(0.32,0.72,0,1)]"
        />
      </span>
      <h3 className="text-[1.375rem] font-bold text-text">
        {t('data.done.title', { count: done.imported })}
      </h3>
      <p className="text-[0.9375rem] text-text-muted">{sentences.join(' ')}</p>
      <div className="mt-6 flex w-full flex-col gap-1">
        <Button
          className="w-full"
          onClick={() => {
            onClose()
            void navigate({ to: '/transactions' })
          }}
        >
          {t('data.done.see')}
        </Button>
        <Button variant="ghost" className="w-full text-danger" onClick={onUndo}>
          {t('data.done.undo')}
        </Button>
      </div>
    </div>
  )
}
