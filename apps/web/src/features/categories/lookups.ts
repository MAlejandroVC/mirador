import {
  type Category,
  type CategoryGroup,
  categoryOf,
  type Payee,
  systemCategories,
  type Tag,
  type Transaction,
} from '@repo/core'
import type { Ledger } from '../wallets/use-ledger'

/** Everything a screen needs to show a transaction's category, group, tags and payee. */
export interface Taxonomy {
  groups: ReadonlyMap<string, CategoryGroup>
  categories: ReadonlyMap<string, Category>
  tags: ReadonlyMap<string, Tag>
  payees: ReadonlyMap<string, Payee>
  /** The category it shows under (CAT-05: Uncategorized, Fees, Interest), or null. */
  categoryOf: (transaction: Pick<Transaction, 'kind' | 'categoryId'>) => Category | null
  groupOf: (category: Category) => CategoryGroup | undefined
}

export function taxonomy(
  ledger: Pick<Ledger, 'groups' | 'categories' | 'tags' | 'payees'>,
): Taxonomy {
  const groups = new Map(ledger.groups.map((group) => [group.id, group]))
  const categories = new Map(ledger.categories.map((category) => [category.id, category]))
  const system = systemCategories(ledger.categories)
  return {
    groups,
    categories,
    tags: new Map(ledger.tags.map((tag) => [tag.id, tag])),
    payees: new Map(ledger.payees.map((payee) => [payee.id, payee])),
    categoryOf: (transaction) => categoryOf(transaction, categories, system),
    groupOf: (category) => groups.get(category.groupId),
  }
}
