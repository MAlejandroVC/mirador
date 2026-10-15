import type { CuratedColor, WalletIcon, WalletPreset, WalletRecord } from '@repo/api'
import { applyPreset, newWallet } from '@repo/core'
import {
  AirplaneIcon,
  BankIcon,
  BriefcaseIcon,
  CarIcon,
  ChartLineUpIcon,
  CoinsIcon,
  CreditCardIcon,
  GiftIcon,
  GraduationCapIcon,
  HandCoinsIcon,
  HouseIcon,
  type Icon,
  MoneyIcon,
  PiggyBankIcon,
  StorefrontIcon,
  VaultIcon,
  WalletIcon as WalletGlyph,
} from '../../components/ui/icons'

// WAL-23, DL-ICO-03: the curated wallet icons, all drawn so their Duotone layer shades
// part of the drawing itself.
export const walletIconComponents: Record<WalletIcon, Icon> = {
  wallet: WalletGlyph,
  money: MoneyIcon,
  coins: CoinsIcon,
  bank: BankIcon,
  piggyBank: PiggyBankIcon,
  vault: VaultIcon,
  creditCard: CreditCardIcon,
  handCoins: HandCoinsIcon,
  chartLineUp: ChartLineUpIcon,
  gift: GiftIcon,
  storefront: StorefrontIcon,
  briefcase: BriefcaseIcon,
  house: HouseIcon,
  car: CarIcon,
  graduationCap: GraduationCapIcon,
  airplane: AirplaneIcon,
}

/** WAL-23: the icon and color each preset starts with, as in docs/design-language.html. */
export const presetLooks: Record<WalletPreset, { icon: WalletIcon; color: CuratedColor }> = {
  cash: { icon: 'money', color: 'marigold' },
  checking: { icon: 'bank', color: 'lake' },
  savings: { icon: 'piggyBank', color: 'moss' },
  investment: { icon: 'chartLineUp', color: 'heather' },
  creditCard: { icon: 'creditCard', color: 'berry' },
  loan: { icon: 'handCoins', color: 'dusk' },
  voucher: { icon: 'gift', color: 'clay' },
  generic: { icon: 'wallet', color: 'stone' },
}

/** WAL-02: a new wallet with its preset's icon and color. */
export function newWalletRecord(name: string, currency: string): WalletRecord {
  return { ...newWallet(name, currency), ...presetLooks.generic }
}

/**
 * WAL-11, WAL-23: another preset brings its features and, while the person hasn't
 * chosen their own icon and color, its look too.
 */
export function withPreset(wallet: WalletRecord, preset: WalletPreset): WalletRecord {
  const before = presetLooks[wallet.preset]
  const keptLook = wallet.icon !== before.icon || wallet.color !== before.color
  return { ...applyPreset(wallet, preset), ...(keptLook ? {} : presetLooks[preset]) }
}
