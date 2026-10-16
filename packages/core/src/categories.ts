import type { Transaction } from './transactions.ts'

// Epic 4: category groups, categories, tags and payees. Pure functions over the
// decrypted records; nothing here names a category, since every one is the person's
// own (CAT-10). The types mirror the record schemas in @repo/api.

export type CuratedColor =
  | 'clay'
  | 'bark'
  | 'marigold'
  | 'meadow'
  | 'moss'
  | 'lagoon'
  | 'lake'
  | 'dusk'
  | 'heather'
  | 'plum'
  | 'berry'
  | 'stone'

/** The 12 curated colors, in the picker's order (DL-COL-11). */
export const colorOrder: readonly CuratedColor[] = [
  'clay',
  'bark',
  'marigold',
  'meadow',
  'moss',
  'lagoon',
  'lake',
  'dusk',
  'heather',
  'plum',
  'berry',
  'stone',
]

export type CategoryKind = 'expense' | 'income' | 'any'
export type Flexibility = 'locked' | 'fixed' | 'flexible'
export type SystemCategoryKey = 'uncategorized' | 'adjustment' | 'interest' | 'fees' | 'refunds'

export interface CategoryGroup {
  id: string
  name: string
  color: CuratedColor
  order?: number
  archived?: boolean
}

export interface Category {
  id: string
  name: string
  groupId: string
  kind: CategoryKind
  icon: string
  flexibility: Flexibility
  description?: string
  order?: number
  archived?: boolean
  systemKey?: SystemCategoryKey
}

export interface Tag {
  id: string
  name: string
  color: CuratedColor
  archived?: boolean
}

export interface Payee {
  id: string
  name: string
}

/** CAT-01: the person's order; the rest in the order they were added (UUIDv7 ids). */
export function inOrder<T extends { id: string; order?: number }>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
      a.id.localeCompare(b.id),
  )
}

/** CAT-01: after a reorder, the items whose place changed, with their new `order`. */
export function reordered<T extends { order?: number }>(ordered: readonly T[]): T[] {
  return ordered.flatMap((item, order) => (item.order === order ? [] : [{ ...item, order }]))
}

/**
 * CAT-05: one category per system key. Two devices that each set up categories before
 * syncing can both make one; the oldest wins and the other is left out.
 */
export function withoutDuplicateSystem<C extends Category>(categories: readonly C[]): C[] {
  const kept = new Map<string, C>()
  const result: C[] = []
  for (const category of [...categories].sort((a, b) => a.id.localeCompare(b.id))) {
    if (category.systemKey === undefined) {
      result.push(category)
      continue
    }
    if (kept.has(category.systemKey)) continue
    kept.set(category.systemKey, category)
    result.push(category)
  }
  return result
}

/** CAT-03: whether `name` is already used by one of `others`, ignoring case and spaces. */
export function nameTaken(name: string, others: readonly { name: string }[]): boolean {
  const wanted = name.trim().toLocaleLowerCase()
  return others.some((other) => other.name.trim().toLocaleLowerCase() === wanted)
}

/**
 * The category a transaction shows under. An expense or income without one is
 * Uncategorized, and a fee or interest a wallet posted shows under Fees or Interest
 * (CAT-05). Transfers, opening balances and other balance changes have none.
 */
export function categoryOf<C extends Category>(
  transaction: Pick<Transaction, 'kind' | 'categoryId'>,
  byId: ReadonlyMap<string, C>,
  bySystemKey: ReadonlyMap<SystemCategoryKey, C>,
): C | null {
  if (transaction.categoryId !== undefined) {
    const category = byId.get(transaction.categoryId)
    if (category) return category
  }
  switch (transaction.kind) {
    case 'expense':
    case 'income':
      return bySystemKey.get('uncategorized') ?? null
    case 'fee':
      return bySystemKey.get('fees') ?? null
    case 'interest':
      return bySystemKey.get('interest') ?? null
    default:
      return null
  }
}

/** The system categories by key (CAT-05). */
export function systemCategories<C extends Category>(
  categories: readonly C[],
): Map<SystemCategoryKey, C> {
  const found = new Map<SystemCategoryKey, C>()
  for (const category of categories)
    if (category.systemKey !== undefined && !found.has(category.systemKey))
      found.set(category.systemKey, category)
  return found
}

/**
 * CAT-07, CAT-02: the categories a picker offers for an expense or an income: not
 * archived, in a category group that isn't archived, and of that kind or both. The one
 * already chosen stays, so editing an old transaction never loses it.
 */
export function pickableCategories<C extends Category>(
  categories: readonly C[],
  groups: readonly CategoryGroup[],
  type: 'expense' | 'income',
  current?: string | null,
): C[] {
  const archivedGroups = new Set(groups.filter((group) => group.archived).map((group) => group.id))
  return categories.filter(
    (category) =>
      category.id === current ||
      (!category.archived &&
        !archivedGroups.has(category.groupId) &&
        (category.kind === type || category.kind === 'any') &&
        category.systemKey !== 'adjustment'),
  )
}

/** CAT-12: how often each category is used, to put the most used first. */
export function categoryUsage(transactions: readonly Transaction[]): Map<string, number> {
  const usage = new Map<string, number>()
  for (const transaction of transactions)
    if (transaction.categoryId !== undefined)
      usage.set(transaction.categoryId, (usage.get(transaction.categoryId) ?? 0) + 1)
  return usage
}

/** CAT-12: the most used of `categories`, most used first, at most `count`. */
export function frequentCategories<C extends Category>(
  categories: readonly C[],
  usage: ReadonlyMap<string, number>,
  count: number,
): C[] {
  return categories
    .filter((category) => (usage.get(category.id) ?? 0) > 0)
    .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.id.localeCompare(b.id))
    .slice(0, count)
}

/**
 * CAT-23: tags in the order to suggest them: those used most with `categoryId` first,
 * then the most used overall, then the rest by name. Archived tags are left out unless
 * already chosen.
 */
export function suggestedTags<T extends Tag>(
  tags: readonly T[],
  transactions: readonly Transaction[],
  categoryId: string | null,
  chosen: readonly string[] = [],
): T[] {
  const withCategory = new Map<string, number>()
  const overall = new Map<string, number>()
  for (const transaction of transactions)
    for (const tagId of transaction.tagIds ?? []) {
      overall.set(tagId, (overall.get(tagId) ?? 0) + 1)
      if (categoryId !== null && transaction.categoryId === categoryId)
        withCategory.set(tagId, (withCategory.get(tagId) ?? 0) + 1)
    }
  return tags
    .filter((tag) => !tag.archived || chosen.includes(tag.id))
    .sort(
      (a, b) =>
        (withCategory.get(b.id) ?? 0) - (withCategory.get(a.id) ?? 0) ||
        (overall.get(b.id) ?? 0) - (overall.get(a.id) ?? 0) ||
        a.name.localeCompare(b.name),
    )
}

/** How many transactions carry each tag, for deleting one (CAT-22). */
export function tagUsage(transactions: readonly Transaction[]): Map<string, number> {
  const usage = new Map<string, number>()
  for (const transaction of transactions)
    for (const tagId of transaction.tagIds ?? []) usage.set(tagId, (usage.get(tagId) ?? 0) + 1)
  return usage
}

/** CAT-25: a new tag takes the color fewest tags have, in the picker's order. */
export function nextTagColor(tags: readonly Pick<Tag, 'color'>[]): CuratedColor {
  const counts = new Map<CuratedColor, number>()
  for (const tag of tags) counts.set(tag.color, (counts.get(tag.color) ?? 0) + 1)
  let best: CuratedColor = 'clay'
  let fewest = Number.MAX_SAFE_INTEGER
  for (const color of colorOrder) {
    const count = counts.get(color) ?? 0
    if (count < fewest) {
      best = color
      fewest = count
    }
  }
  return best
}

/** What a payee was used with last time (TXN-08). */
export interface PayeeMemory {
  type: 'expense' | 'income'
  categoryId?: string
  tagIds: string[]
  walletId: string
}

/**
 * TXN-08: the category, tags and wallet of the newest expense or income with this
 * payee, to fill in when the person picks it again.
 */
export function payeeMemory(
  transactions: readonly Transaction[],
  payeeId: string,
): PayeeMemory | null {
  let last: Transaction | null = null
  for (const transaction of transactions) {
    if (transaction.payeeId !== payeeId) continue
    if (transaction.kind !== 'expense' && transaction.kind !== 'income') continue
    if (
      !last ||
      transaction.date > last.date ||
      (transaction.date === last.date && transaction.id > last.id)
    )
      last = transaction
  }
  if (!last || (last.kind !== 'expense' && last.kind !== 'income')) return null
  return {
    type: last.kind,
    ...(last.categoryId !== undefined ? { categoryId: last.categoryId } : {}),
    tagIds: last.tagIds ?? [],
    walletId: last.walletId,
  }
}

/** The items whose names contain `query`, ignoring case and accents, by name. */
export function matchingByName<T extends { name: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const fold = (text: string) =>
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase()
      .trim()
  const wanted = fold(query)
  return items
    .filter((item) => wanted === '' || fold(item.name).includes(wanted))
    .sort((a, b) => a.name.localeCompare(b.name))
}
