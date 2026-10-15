import type { WalletPreset } from '@repo/api'
import { currencyName, netWorth, toCalendarDate, unitsPerOne, walletBalances } from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountButton } from '../../components/shell'
import { Amount } from '../../components/ui/amount'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { HeroCard } from '../../components/ui/hero-card'
import { IconTile } from '../../components/ui/icon-tile'
import { ArrowsDownUpIcon, BinocularsIcon, PlusIcon } from '../../components/ui/icons'
import { List, ListButtonRow, ListLinkRow, ListRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { formatDay, formatRate, formatShare, useMoney } from '../../lib/format'
import { RateSheet } from './rate-sheet'
import { ReorderSheet } from './reorder-sheet'
import { type LedgerWallet, useLedger } from './use-ledger'
import { presetLooks, walletIconComponents } from './wallet-look'
import { WalletSheet } from './wallet-sheet'

type View = 'wallets' | 'types'

// Epic 1: every wallet and its balance in one place, with net worth on top (WAL-20)
// and what I have and what I owe spread by wallet or by type (WAL-21), as drawn in
// docs/design-language.html.
export function WalletsScreen() {
  const { t } = useTranslation()
  const { data: ledger } = useLedger()
  const [adding, setAdding] = useState(false)
  const [view, setView] = useState<View>('wallets')
  const [reordering, setReordering] = useState(false)
  const [rateFor, setRateFor] = useState<string | null>(null)
  const defaultCurrency = ledger?.defaultCurrency ?? 'USD'
  const money = useMoney(defaultCurrency)

  const add = () => {
    setAdding(true)
  }
  // The same key on both screens (empty and listed), so React keeps the sheet when the
  // first wallet turns one into the other, with the rate it may be asking for (SYS-04).
  const sheet = (
    <WalletSheet
      key="new-wallet"
      open={adding}
      mode={{ kind: 'new' }}
      defaultCurrency={defaultCurrency}
      onClose={() => {
        setAdding(false)
      }}
    />
  )

  if (!ledger) return <Page title={t('nav.wallets')} actions={<AccountButton />} />

  if (ledger.wallets.length === 0)
    return (
      <Page title={t('nav.wallets')} actions={<AccountButton />}>
        {/* DL-CMP-14, DL-VOC-02: a touch of whimsy where nothing is there yet. */}
        <EmptyState
          icon={BinocularsIcon}
          title={t('wallets.empty.title')}
          action={
            <Button className="mt-1 px-6" onClick={add}>
              {t('wallets.add')}
            </Button>
          }
        >
          {t('wallets.empty.body')}
        </EmptyState>
        {sheet}
      </Page>
    )

  const today = toCalendarDate(new Date())
  const balances = walletBalances(ledger.wallets, ledger.transactions)
  const worth = netWorth(ledger.wallets, balances, defaultCurrency, ledger.rates, today)
  const amount = (wallet: LedgerWallet) => balances.get(wallet.id) ?? 0
  const shares = new Map(
    [...worth.haveSpread.byWallet, ...worth.oweSpread.byWallet].map((share) => [
      share.wallet.id,
      share.share,
    ]),
  )
  const have = ledger.wallets.filter((wallet) => amount(wallet) >= 0)
  const owe = ledger.wallets.filter((wallet) => amount(wallet) < 0)
  const total = (minor: number) => money.text({ minor, currency: defaultCurrency })

  // WAL-21: one row per wallet, with its part of what I have or what I owe.
  const walletRow = (wallet: LedgerWallet) => {
    const balance = { minor: amount(wallet), currency: wallet.currency }
    const share = shares.get(wallet.id)
    const notes = [
      t(`wallets.presets.${wallet.preset}`),
      share === undefined
        ? wallet.inNetWorth
          ? t('wallets.noRate')
          : t('wallets.notInNetWorth')
        : formatShare(share, money.locale),
      ...(wallet.active ? [] : [t('wallets.inactive')]),
    ]
    return (
      <ListLinkRow
        key={wallet.id}
        to="/wallets/$walletId"
        params={{ walletId: wallet.id }}
        leading={<IconTile icon={walletIconComponents[wallet.icon]} color={wallet.color} />}
        title={wallet.name}
        subtitle={notes.join(' · ')}
        trailing={<Amount parts={money.parts(balance)} label={money.text(balance)} />}
      />
    )
  }

  // WAL-21: the same, by type. Types aren't wallets, so their tiles are the app's own
  // `brand` (DL-COL-13).
  const presetRow = ({
    preset,
    total: minor,
    wallets,
    share,
  }: {
    preset: WalletPreset
    total: number
    wallets: number
    share: number
  }) => {
    const value = { minor, currency: defaultCurrency }
    return (
      <ListRow
        key={preset}
        leading={<IconTile icon={walletIconComponents[presetLooks[preset].icon]} />}
        title={t(`wallets.presets.${preset}`)}
        subtitle={`${t('wallets.count', { count: wallets })} · ${formatShare(share, money.locale)}`}
        trailing={<Amount parts={money.parts(value)} label={money.text(value)} />}
      />
    )
  }

  // Currencies of wallets counted in net worth other than the default one.
  const otherCurrencies = [
    ...new Set(
      ledger.wallets
        .filter((wallet) => wallet.inNetWorth && wallet.currency !== defaultCurrency)
        .map((wallet) => wallet.currency),
    ),
  ]

  const context = [
    t('wallets.across', { count: worth.counted }),
    ...(worth.liquid > 0 ? [t('wallets.liquid', { amount: total(worth.liquid) })] : []),
  ].join(' · ')
  const net = { minor: worth.netWorth, currency: defaultCurrency }

  return (
    <Page title={t('nav.wallets')} actions={<AccountButton />}>
      <HeroCard
        label={t('wallets.netWorth')}
        amount={<Amount parts={money.parts(net)} label={money.text(net)} size="hero" tone="hero" />}
        context={context}
      />
      <SegmentedControl<View>
        label={t('wallets.view')}
        options={[
          { value: 'wallets', label: t('wallets.views.wallets') },
          { value: 'types', label: t('wallets.views.types') },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'wallets' ? (
        <>
          {have.length > 0 && (
            <List label={t('wallets.have')} detail={total(worth.have)}>
              {have.map(walletRow)}
            </List>
          )}
          {owe.length > 0 && (
            <List label={t('wallets.owe')} detail={total(worth.owe)}>
              {owe.map(walletRow)}
            </List>
          )}
        </>
      ) : (
        <>
          {worth.haveSpread.byPreset.length > 0 && (
            <List label={t('wallets.have')} detail={total(worth.have)}>
              {worth.haveSpread.byPreset.map(presetRow)}
            </List>
          )}
          {worth.oweSpread.byPreset.length > 0 && (
            <List label={t('wallets.owe')} detail={total(worth.owe)}>
              {worth.oweSpread.byPreset.map(presetRow)}
            </List>
          )}
        </>
      )}
      {/* SYS-04, SYS-05: each other currency's rate and its date, or a way to add one. */}
      {otherCurrencies.length > 0 && (
        <List label={t('rates.section')}>
          {otherCurrencies.map((currency) => {
            const inUse = worth.ratesUsed.get(currency)
            return (
              <ListButtonRow
                key={currency}
                tone="text"
                title={
                  inUse
                    ? `1 ${currency} = ${formatRate(unitsPerOne(inUse), money.locale)} ${defaultCurrency}`
                    : currencyName(currency, money.locale)
                }
                subtitle={
                  inUse
                    ? formatDay(inUse.rate.date, today, money.locale, {
                        today: t('dates.today'),
                        yesterday: t('dates.yesterday'),
                      })
                    : t('rates.missing')
                }
                trailing={
                  <span className={`text-[0.9375rem] ${inUse ? 'text-text-muted' : 'text-brand'}`}>
                    {inUse ? t('rates.change') : t('rates.add')}
                  </span>
                }
                onClick={() => {
                  setRateFor(currency)
                }}
              />
            )
          })}
        </List>
      )}
      <List>
        <ListButtonRow
          leading={<PlusIcon aria-hidden className="size-[1.375rem] text-brand" />}
          title={t('wallets.add')}
          onClick={add}
        />
        {ledger.wallets.length > 1 && (
          <ListButtonRow
            leading={<ArrowsDownUpIcon aria-hidden className="size-[1.375rem] text-brand" />}
            title={t('wallets.reorder.button')}
            onClick={() => {
              setReordering(true)
            }}
          />
        )}
      </List>
      {sheet}
      <ReorderSheet
        open={reordering}
        wallets={ledger.wallets}
        onClose={() => {
          setReordering(false)
        }}
      />
      <RateSheet
        open={rateFor !== null}
        currency={rateFor ?? defaultCurrency}
        defaultCurrency={defaultCurrency}
        rates={ledger.rates}
        onClose={() => {
          setRateFor(null)
        }}
      />
    </Page>
  )
}
