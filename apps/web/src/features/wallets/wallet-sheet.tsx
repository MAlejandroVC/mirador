import {
  curatedColors,
  type WalletFeature,
  walletFeatures,
  walletIcons,
  walletPresets,
  type WalletRecord,
  walletRecord,
} from '@repo/api'
import {
  canChangeCurrency,
  currencyName,
  fractionDigits,
  openingBalance,
  parseAmount,
  presetDefaults,
  rateInUse,
  toCalendarDate,
  toggleFeature,
} from '@repo/core'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionSheet } from '../../components/ui/action-sheet'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { IconTile } from '../../components/ui/icon-tile'
import { CaretRightIcon } from '../../components/ui/icons'
import { List } from '../../components/ui/list'
import { MoneyInput } from '../../components/ui/money-input'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet, SheetFooter } from '../../components/ui/sheet'
import { tileStyle } from '../../components/ui/tile-style'
import { useLocale } from '../../lib/format'
import { CurrencyList } from './currency-list'
import { RateSheet } from './rate-sheet'
import {
  type LedgerWallet,
  newId,
  preferencesChange,
  type RecordChange,
  transactionBody,
  useLedger,
  useSaveRecords,
  walletBody,
} from './use-ledger'
import { newWalletRecord, presetLooks, walletIconComponents, withPreset } from './wallet-look'

export type WalletSheetMode =
  { kind: 'new' } | { kind: 'edit'; wallet: LedgerWallet; transactionCount: number }

// WAL-01: adding or editing a wallet in a sheet (DL-CMP-08). Only the name is needed
// (WAL-02); the type fills in the rest (WAL-11), and everything stays changeable.
export function WalletSheet({
  open,
  mode,
  defaultCurrency,
  onClose,
  onSaved,
  onDelete,
}: {
  open: boolean
  mode: WalletSheetMode
  defaultCurrency: string
  onClose: () => void
  onSaved?: (id: string) => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const { data: ledger } = useLedger()
  // The form decides whether closing needs to ask first (DL-CMP-08).
  const requestCloseRef = useRef<(() => void) | null>(null)
  // SYS-04: a wallet saved in another currency with no rate yet asks for one next.
  const [rateFor, setRateFor] = useState<string | null>(null)
  return (
    <>
      <Sheet
        open={open}
        title={mode.kind === 'new' ? t('wallets.form.newTitle') : t('wallets.form.editTitle')}
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          ;(requestCloseRef.current ?? onClose)()
        }}
      >
        {/* Mounted only while open, so it starts fresh each time. */}
        {open && (
          <WalletForm
            mode={mode}
            defaultCurrency={defaultCurrency}
            onClose={onClose}
            requestCloseRef={requestCloseRef}
            onSaved={(id, currency) => {
              const today = toCalendarDate(new Date())
              if (
                currency !== defaultCurrency &&
                !rateInUse(currency, defaultCurrency, ledger?.rates ?? [], today)
              )
                setRateFor(currency)
              onSaved?.(id)
            }}
            {...(onDelete ? { onDelete } : {})}
          />
        )}
      </Sheet>
      <RateSheet
        open={rateFor !== null}
        currency={rateFor ?? defaultCurrency}
        defaultCurrency={defaultCurrency}
        rates={ledger?.rates ?? []}
        prompt
        onClose={() => {
          setRateFor(null)
        }}
      />
    </>
  )
}

function WalletForm({
  mode,
  defaultCurrency,
  onClose,
  requestCloseRef,
  onSaved,
  onDelete,
}: {
  mode: WalletSheetMode
  defaultCurrency: string
  onClose: () => void
  requestCloseRef: RefObject<(() => void) | null>
  onSaved: (id: string, currency: string) => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const save = useSaveRecords()
  const { data: ledger } = useLedger()
  const initial =
    mode.kind === 'edit' ? walletRecord.parse(mode.wallet) : newWalletRecord('', defaultCurrency)
  const [draft, setDraft] = useState<WalletRecord>(initial)
  const [balanceText, setBalanceText] = useState('')
  const [owed, setOwed] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [choosingCurrency, setChoosingCurrency] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  // WAL-24: one wallet can be where new transactions start.
  const wasDefault = mode.kind === 'edit' && ledger?.defaultWalletId === mode.wallet.id
  const [isDefault, setIsDefault] = useState(wasDefault)
  const transactionCount = mode.kind === 'edit' ? mode.transactionCount : 0
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initial) ||
    balanceText.trim() !== '' ||
    isDefault !== wasDefault
  const named = draft.name.trim().length > 0

  function checkBalance() {
    if (balanceText.trim() === '' || parseAmount(balanceText, draft.currency, locale) !== null) {
      setBalanceError(null)
      return true
    }
    setBalanceError(t('wallets.form.balanceInvalid'))
    return false
  }

  function submit() {
    if (!named || !checkBalance()) return
    const id = mode.kind === 'edit' ? mode.wallet.id : newId()
    const wallet = { ...draft, name: draft.name.trim() }
    const changes: RecordChange[] = [{ id, body: walletBody(wallet) }]
    // An inactive wallet is left out of pickers (WAL-04), so it can't be the default.
    const nowDefault = isDefault && wallet.active
    if (ledger && nowDefault !== wasDefault)
      changes.push(preferencesChange(ledger, { defaultWalletId: nowDefault ? id : undefined }))
    const amount = parseAmount(balanceText, draft.currency, locale)
    // WAL-05: the opening balance is an ordinary transaction, dated today.
    if (mode.kind === 'new' && amount)
      changes.push({
        id: newId(),
        body: transactionBody(
          openingBalance(id, owed ? -amount : amount, toCalendarDate(new Date())),
        ),
      })
    save.mutate(changes, {
      onSuccess: () => {
        onSaved(id, wallet.currency)
        onClose()
      },
    })
  }

  // DL-CMP-08: closing with unsaved changes asks first.
  useEffect(() => {
    requestCloseRef.current = () => {
      if (dirty) setDiscarding(true)
      else onClose()
    }
    return () => {
      requestCloseRef.current = null
    }
  }, [dirty, onClose, requestCloseRef])

  const IconComponent = walletIconComponents[draft.icon]

  return (
    <>
      <div className="flex flex-col items-center gap-3 pt-1">
        <IconTile icon={IconComponent} color={draft.color} size="large" />
        <label className="w-full">
          <span className="sr-only">{t('wallets.form.name')}</span>
          <input
            value={draft.name}
            onChange={(event) => {
              setDraft({ ...draft, name: event.target.value })
            }}
            maxLength={60}
            placeholder={t('wallets.form.namePlaceholder')}
            autoComplete="off"
            className="min-h-12 w-full rounded-xl bg-inset px-3 text-center text-[1.0625rem] font-semibold text-text placeholder:font-normal placeholder:text-text-muted focus:outline-2 focus:outline-offset-1 focus:outline-brand"
          />
        </label>
      </div>

      <section className="flex flex-col gap-1.5">
        <h3 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
          {t('wallets.form.type')}
        </h3>
        <div
          role="radiogroup"
          aria-label={t('wallets.form.type')}
          className="grid grid-cols-4 gap-1 rounded-2xl bg-inset p-1.5"
        >
          {walletPresets.map((preset) => {
            const checked = draft.preset === preset
            const look = presetLooks[preset]
            return (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => {
                  setDraft(withPreset(draft, preset))
                  if (mode.kind === 'new' && balanceText.trim() === '')
                    setOwed(presetDefaults[preset].owed)
                }}
                className={`flex min-h-[4.75rem] flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-2 focus-visible:outline-2 focus-visible:outline-brand ${
                  checked ? 'bg-surface shadow-[0_1px_3px_rgb(0_0_0/14%)]' : ''
                }`}
              >
                <IconTile icon={walletIconComponents[look.icon]} color={look.color} />
                <span
                  className={`text-center text-[0.8125rem] leading-tight ${checked ? 'font-semibold text-text' : 'text-text-muted'}`}
                >
                  {t(`wallets.presets.${preset}`)}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {mode.kind === 'new' && (
        <section className="flex flex-col gap-1.5">
          <h3 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
            {t('wallets.form.balance')}
          </h3>
          <SegmentedControl
            label={t('wallets.form.balance')}
            options={[
              { value: 'have', label: t('wallets.form.have') },
              { value: 'owe', label: t('wallets.form.owe') },
            ]}
            value={owed ? 'owe' : 'have'}
            onChange={(value) => {
              setOwed(value === 'owe')
            }}
          />
          <ul className="rounded-2xl bg-inset">
            <li>
              <label className="flex min-h-[3.25rem] items-center gap-3 px-4">
                <span className="text-[0.9375rem] text-text">{t('wallets.form.balanceToday')}</span>
                <span className="flex min-w-0 flex-1 justify-end">
                  <MoneyInput
                    value={balanceText}
                    onChange={setBalanceText}
                    onBlur={checkBalance}
                    locale={locale}
                    decimals={fractionDigits(draft.currency)}
                    aria-invalid={balanceError ? true : undefined}
                    className="min-h-11 max-w-full text-right text-[0.9375rem] text-text"
                  />
                </span>
              </label>
            </li>
          </ul>
          {balanceError ? (
            <p className="px-4 text-[0.8125rem] text-warning">{balanceError}</p>
          ) : (
            <p className="px-4 text-[0.8125rem] text-text-muted">{t('wallets.form.balanceHint')}</p>
          )}
        </section>
      )}

      <List inset>
        <li>
          <button
            type="button"
            onClick={() => {
              setChoosingCurrency(true)
            }}
            className="flex min-h-[3.25rem] w-full items-center gap-2 px-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
          >
            <span className="flex-1 text-[0.9375rem] text-text">{t('wallets.form.currency')}</span>
            <span className="text-[0.9375rem] text-text-muted">
              {currencyName(draft.currency, locale)}
            </span>
            <CaretRightIcon aria-hidden className="size-4 text-text-faint" />
          </button>
        </li>
      </List>

      <section className="flex flex-col gap-1.5">
        <h3 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
          {t('wallets.form.look')}
        </h3>
        <div className="flex flex-col gap-2 rounded-2xl bg-inset p-2">
          {/* WAL-23: the 12 curated colors, in the picker's order (DL-COL-11). */}
          <div role="radiogroup" aria-label={t('wallets.form.color')} className="grid grid-cols-6">
            {curatedColors.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={draft.color === color}
                aria-label={t(`colors.${color}`)}
                onClick={() => {
                  setDraft({ ...draft, color })
                }}
                className="grid min-h-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-brand"
              >
                <span
                  className={`size-8 rounded-full ${draft.color === color ? 'ring-2 ring-text ring-offset-2 ring-offset-inset' : ''}`}
                  style={{ backgroundColor: `var(--mirador-${color})` }}
                />
              </button>
            ))}
          </div>
          <div
            role="radiogroup"
            aria-label={t('wallets.form.icon')}
            className="grid grid-cols-6 gap-y-1 border-t-[0.5px] border-separator pt-2"
          >
            {walletIcons.map((icon) => {
              const Glyph = walletIconComponents[icon]
              const checked = draft.icon === icon
              return (
                <button
                  key={icon}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={t(`wallets.icons.${icon}`)}
                  onClick={() => {
                    setDraft({ ...draft, icon })
                  }}
                  className="grid min-h-11 place-items-center rounded-xl focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <span
                    style={checked ? tileStyle(draft.color) : undefined}
                    className={`grid size-10 place-items-center rounded-[0.625rem] ${checked ? '' : 'text-text-muted'}`}
                  >
                    <Glyph weight={checked ? 'duotone' : 'regular'} className="size-6" />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <FeatureList
        features={draft.features}
        onToggle={(feature) => {
          setDraft(toggleFeature(draft, feature))
        }}
      />

      <List label={t('wallets.form.countIn')} inset>
        <ChoiceRow
          title={t('wallets.form.netWorth')}
          checked={draft.inNetWorth}
          onToggle={() => {
            setDraft({ ...draft, inNetWorth: !draft.inNetWorth })
          }}
        />
        <ChoiceRow
          title={t('wallets.form.budget')}
          checked={draft.inBudget}
          onToggle={() => {
            setDraft({ ...draft, inBudget: !draft.inBudget })
          }}
        />
      </List>

      {draft.active && (
        <div className="flex flex-col gap-1.5">
          <List inset>
            <ChoiceRow
              title={t('wallets.form.default')}
              checked={isDefault}
              onToggle={() => {
                setIsDefault(!isDefault)
              }}
            />
          </List>
          <p className="px-4 text-[0.8125rem] text-text-muted">{t('wallets.form.defaultHint')}</p>
        </div>
      )}

      {mode.kind === 'edit' && (
        <>
          <List inset>
            <ChoiceRow
              title={t('wallets.form.active')}
              subtitle={t('wallets.form.activeHint')}
              checked={draft.active}
              onToggle={() => {
                setDraft({ ...draft, active: !draft.active })
              }}
            />
          </List>
          {onDelete && (
            <Button variant="danger" onClick={onDelete}>
              {t('wallets.delete.button')}
            </Button>
          )}
        </>
      )}

      {save.isError && (
        <p className="px-4 text-[0.8125rem] text-warning">{t('wallets.saveFailed')}</p>
      )}

      <SheetFooter>
        <Button className="w-full" disabled={!named || save.isPending} onClick={submit}>
          {t('wallets.form.save')}
        </Button>
      </SheetFooter>

      <Sheet
        open={choosingCurrency}
        title={t('wallets.form.currency')}
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          setChoosingCurrency(false)
        }}
      >
        {choosingCurrency && (
          <CurrencyList
            inset
            value={draft.currency}
            disabled={(currency) =>
              canChangeCurrency(draft.currency, currency, transactionCount)
                ? null
                : t('wallets.form.currencyDecimals')
            }
            onChoose={(currency) => {
              setDraft({ ...draft, currency })
              setChoosingCurrency(false)
            }}
          />
        )}
      </Sheet>

      <ActionSheet
        open={discarding}
        title={t('wallets.form.discardTitle')}
        message={t('wallets.form.discardMessage')}
        cancelLabel={t('wallets.form.keepEditing')}
        actions={[{ label: t('wallets.form.discard'), tone: 'danger', onSelect: onClose }]}
        onClose={() => {
          setDiscarding(false)
        }}
      />
    </>
  )
}

/**
 * WAL-12: the features as a list that shows only the ones switched on, and all of them
 * with "Show all features", as an iOS disclosure. A feature turned off while folded stays
 * in view until the list is folded again, so a row never vanishes under the finger.
 */
function FeatureList({
  features,
  onToggle,
}: {
  features: readonly WalletFeature[]
  onToggle: (feature: WalletFeature) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<readonly WalletFeature[]>(features)
  // A new type switches on other features; those are the ones to show.
  if (!features.every((feature) => shown.includes(feature))) setShown(features)
  const rows = open ? walletFeatures : walletFeatures.filter((feature) => shown.includes(feature))
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
        {t('wallets.form.features')}
      </h3>
      <ul className="overflow-hidden rounded-2xl bg-inset">
        {rows.map((feature) => (
          <ChoiceRow
            key={feature}
            title={t(`wallets.features.${feature}.title`)}
            subtitle={t(`wallets.features.${feature}.body`)}
            checked={features.includes(feature)}
            onToggle={() => {
              onToggle(feature)
            }}
          />
        ))}
        <li className="group">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              if (open) setShown(features)
              setOpen(!open)
            }}
            className="flex min-h-11 w-full items-center gap-2 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
          >
            <span className="flex min-h-11 flex-1 items-center gap-2 self-stretch border-t-[0.5px] border-separator pr-4 group-first:border-t-0">
              <span className="flex-1 text-[0.9375rem] text-brand">
                {open ? t('wallets.form.featuresLess') : t('wallets.form.featuresMore')}
              </span>
              <CaretRightIcon
                aria-hidden
                className={`size-4 text-text-faint transition-transform motion-reduce:transition-none ${open ? '-rotate-90' : 'rotate-90'}`}
              />
            </span>
          </button>
        </li>
      </ul>
      <p className="px-4 text-[0.8125rem] text-text-muted">{t('wallets.form.featuresHint')}</p>
    </section>
  )
}
