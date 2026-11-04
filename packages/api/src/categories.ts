import { z } from 'zod'
import { recordId } from './records.ts'
import { curatedColors } from './wallets.ts'

// Epic 4 (CAT): category groups, categories, tags and payees. Each lives in its own
// encrypted record (SEC-01), so the server never learns how a person sorts their money.
// None is hard-coded: the starter set is only a suggestion (CAT-04, CAT-10).

/** The curated category icons (CAT-14, DL-ICO-01, DL-ICO-03), in the picker's order. */
export const categoryIcons = [
  // Home
  'house',
  'buildings',
  'scroll',
  'lightning',
  'drop',
  'flame',
  'wifiHigh',
  'deviceMobile',
  'handHeart',
  'broom',
  'hammer',
  'toolbox',
  'armchair',
  'lamp',
  'plant',
  'washingMachine',
  'lightbulb',
  // Food and drinks
  'basket',
  'shoppingCart',
  'forkKnife',
  'hamburger',
  'pizza',
  'moped',
  'coffee',
  'cookie',
  'cake',
  'carrot',
  'bread',
  'wine',
  'beerStein',
  'martini',
  // Getting around
  'gasPump',
  'train',
  'bus',
  'taxi',
  'car',
  'motorcycle',
  'bicycle',
  'roadHorizon',
  'wrench',
  'shieldCheck',
  'identificationCard',
  'sparkle',
  // Health
  'stethoscope',
  'tooth',
  'pill',
  'heartbeat',
  'firstAid',
  'brain',
  'eyeglasses',
  'barbell',
  'personSimpleRun',
  // Shopping and personal
  'tShirt',
  'sneaker',
  'scissors',
  'laptop',
  'shoppingBag',
  'watch',
  'diamond',
  'flower',
  'gift',
  'heart',
  'briefcase',
  // Family and pets
  'baby',
  'balloon',
  'graduationCap',
  'bookOpen',
  'pawPrint',
  'dog',
  'cat',
  // Fun
  'repeat',
  'television',
  'filmSlate',
  'popcorn',
  'ticket',
  'confetti',
  'musicNotes',
  'headphones',
  'gameController',
  'soccerBall',
  'guitar',
  'camera',
  'paintBrush',
  'books',
  // Travel
  'airplaneTilt',
  'bed',
  'suitcaseRolling',
  'mapTrifold',
  'tent',
  'mountains',
  'globe',
  // Money
  'invoice',
  'receipt',
  'percent',
  'umbrella',
  'bank',
  'creditCard',
  'piggyBank',
  'handshake',
  'tipJar',
  'money',
  'coins',
  'handCoins',
  'chartLineUp',
  'key',
  'storefront',
  'package',
  'arrowUUpLeft',
  'scales',
  'questionMark',
] as const
export type CategoryIcon = (typeof categoryIcons)[number]

/**
 * CAT-02, BUD-10: a commitment (`locked`) is never cut, a need (`fixed`) changes only by
 * hand, a want (`flexible`) can be cut. The stored keys keep their first names, so
 * existing records stay valid; people only ever see Commitment, Need and Want.
 */
export const flexibilities = ['locked', 'fixed', 'flexible'] as const
export type Flexibility = (typeof flexibilities)[number]

/**
 * CAT-02: whether a category is for money out or money in. `any` is only for system
 * categories that take both, such as Uncategorized (CAT-05).
 */
export const categoryKinds = ['expense', 'income', 'any'] as const
export type CategoryKind = (typeof categoryKinds)[number]

/** CAT-05: the categories every set has, which can be renamed but not deleted. */
export const systemCategoryKeys = [
  'uncategorized',
  'adjustment',
  'interest',
  'fees',
  'refunds',
] as const
export type SystemCategoryKey = (typeof systemCategoryKeys)[number]

const name = z.string().trim().min(1).max(60)
// Its place among its siblings; those without one follow, oldest first (CAT-01).
const order = z.int().min(0).optional()

export const categoryGroupRecordType = 'categoryGroup'

export const categoryGroupRecord = z.object({
  name,
  // CAT-14: every category in the group shows in its color.
  color: z.enum(curatedColors),
  order,
  // CAT-07: hidden from pickers, kept in history and reports.
  archived: z.boolean().optional(),
})
export type CategoryGroupRecord = z.infer<typeof categoryGroupRecord>

export const categoryRecordType = 'category'

export const categoryRecord = z
  .object({
    name,
    groupId: recordId,
    kind: z.enum(categoryKinds),
    icon: z.enum(categoryIcons),
    flexibility: z.enum(flexibilities),
    description: z.string().trim().max(200).optional(),
    order,
    archived: z.boolean().optional(),
    systemKey: z.enum(systemCategoryKeys).optional(),
  })
  .refine((category) => category.kind !== 'any' || category.systemKey !== undefined, {
    message: 'Only a system category takes both money in and money out',
  })
export type CategoryRecord = z.infer<typeof categoryRecord>

export const tagRecordType = 'tag'

export const tagRecord = z.object({
  name: z.string().trim().min(1).max(40),
  // CAT-25
  color: z.enum(curatedColors),
  archived: z.boolean().optional(),
})
export type TagRecord = z.infer<typeof tagRecord>

export const payeeRecordType = 'payee'

/** The optional merchant or person on the other side of a transaction (TXN fields). */
export const payeeRecord = z.object({
  name: z.string().trim().min(1).max(80),
})
export type PayeeRecord = z.infer<typeof payeeRecord>
