import { describe, expect, it } from 'vitest'
import {
  type Category,
  categoryOf,
  frequentCategories,
  categoryUsage,
  matchingByName,
  nameTaken,
  nextTagColor,
  payeeMemory,
  pickableCategories,
  suggestedTags,
  systemCategories,
  withoutDuplicateSystem,
} from './categories.ts'
import { starterGroups, starterSet, starterTags } from './starter-categories.ts'
import type { Transaction } from './transactions.ts'

function category(id: string, extra: Partial<Category> = {}): Category {
  return {
    id,
    name: id,
    groupId: 'food',
    kind: 'expense',
    icon: 'basket',
    flexibility: 'flexible',
    ...extra,
  }
}

function expense(id: string, extra: Partial<Transaction> = {}): Transaction {
  return { id, kind: 'expense', walletId: 'cash', date: '2026-10-01', amount: -100, ...extra }
}

const uncategorized = category('uncategorized', {
  groupId: 'other',
  kind: 'any',
  systemKey: 'uncategorized',
})
const fees = category('fees', { groupId: 'financial', systemKey: 'fees' })

describe('categories', () => {
  it('CAT-05: a transaction without a category shows under the system category that fits', () => {
    const byId = new Map([['groceries', category('groceries')]])
    const bySystem = systemCategories([uncategorized, fees])
    expect(categoryOf(expense('a', { categoryId: 'groceries' }), byId, bySystem)?.id).toBe(
      'groceries',
    )
    expect(categoryOf(expense('b'), byId, bySystem)?.id).toBe('uncategorized')
    // One whose category was deleted elsewhere also falls back.
    expect(categoryOf(expense('c', { categoryId: 'gone' }), byId, bySystem)?.id).toBe(
      'uncategorized',
    )
    expect(categoryOf({ kind: 'fee' }, byId, bySystem)?.id).toBe('fees')
    expect(categoryOf({ kind: 'transfer' }, byId, bySystem)).toBeNull()
  })

  it('CAT-05: two devices that each set up categories keep one of each system category', () => {
    const second = category('uncategorized-2', { kind: 'any', systemKey: 'uncategorized' })
    // The oldest id wins, so every device keeps the same one.
    expect(
      withoutDuplicateSystem([second, uncategorized, fees])
        .map((item) => item.id)
        .sort(),
    ).toEqual(['fees', 'uncategorized'])
  })

  it('CAT-02, CAT-07: pickers offer active categories of the right kind and keep the chosen one', () => {
    const groups = [
      { id: 'food', name: 'Food', color: 'lake' as const },
      { id: 'old', name: 'Old', color: 'stone' as const, archived: true },
    ]
    const categories = [
      category('groceries'),
      category('salary', { kind: 'income' }),
      category('retired', { archived: true }),
      category('inOldGroup', { groupId: 'old' }),
      uncategorized,
      category('adjustment', { kind: 'any', systemKey: 'adjustment' }),
    ]
    const ids = (list: Category[]) => list.map((item) => item.id)
    expect(ids(pickableCategories(categories, groups, 'expense'))).toEqual([
      'groceries',
      'uncategorized',
    ])
    expect(ids(pickableCategories(categories, groups, 'income'))).toEqual([
      'salary',
      'uncategorized',
    ])
    expect(ids(pickableCategories(categories, groups, 'expense', 'retired'))).toContain('retired')
  })

  it('CAT-03: names are unique ignoring case and spaces', () => {
    expect(nameTaken(' groceries ', [{ name: 'Groceries' }])).toBe(true)
    expect(nameTaken('Grocery', [{ name: 'Groceries' }])).toBe(false)
  })

  it('CAT-12: the most used categories come first', () => {
    const usage = categoryUsage([
      expense('1', { categoryId: 'coffee' }),
      expense('2', { categoryId: 'coffee' }),
      expense('3', { categoryId: 'groceries' }),
    ])
    const list = [category('groceries'), category('coffee'), category('unused')]
    expect(frequentCategories(list, usage, 6).map((item) => item.id)).toEqual([
      'coffee',
      'groceries',
    ])
  })

  it('CAT-23: tags used with the category are suggested first; archived ones are hidden', () => {
    const tags = [
      { id: 'work', name: 'Work', color: 'dusk' as const },
      { id: 'trip', name: 'Trip', color: 'lake' as const },
      { id: 'old', name: 'Old', color: 'stone' as const, archived: true },
    ]
    const transactions = [
      expense('1', { categoryId: 'restaurants', tagIds: ['trip'] }),
      expense('2', { categoryId: 'lunch', tagIds: ['work'] }),
      expense('3', { categoryId: 'lunch', tagIds: ['work'] }),
    ]
    expect(suggestedTags(tags, transactions, 'restaurants').map((tag) => tag.id)).toEqual([
      'trip',
      'work',
    ])
    expect(suggestedTags(tags, transactions, null, ['old']).map((tag) => tag.id)).toContain('old')
  })

  it('CAT-25: a new tag takes the color fewest tags have', () => {
    expect(nextTagColor([])).toBe('clay')
    expect(nextTagColor([{ color: 'clay' }])).toBe('bark')
  })

  it('TXN-08: a payee remembers the category, tags and wallet of its newest transaction', () => {
    const transactions = [
      expense('1', { payeeId: 'oxxo', categoryId: 'snacks', date: '2026-09-01' }),
      expense('2', {
        payeeId: 'oxxo',
        categoryId: 'groceries',
        tagIds: ['trip'],
        walletId: 'debit',
        date: '2026-10-01',
      }),
      expense('3', { payeeId: 'other', categoryId: 'coffee', date: '2026-10-05' }),
    ]
    expect(payeeMemory(transactions, 'oxxo')).toEqual({
      type: 'expense',
      categoryId: 'groceries',
      tagIds: ['trip'],
      walletId: 'debit',
    })
    expect(payeeMemory(transactions, 'new')).toBeNull()
  })

  it('TXN-08: search ignores case and accents', () => {
    const payees = [{ name: 'Panadería Rosetta' }, { name: 'Oxxo' }]
    expect(matchingByName(payees, 'panaderia')).toEqual([{ name: 'Panadería Rosetta' }])
    expect(matchingByName(payees, '')).toHaveLength(2)
  })
})

describe('starter set', () => {
  const names = {
    group: (key: string) => `group.${key}`,
    category: (key: string) => `category.${key}`,
    tag: (key: string) => `tag.${key}`,
  }
  let next = 0
  const newId = () => `id-${String(next++)}`

  it('CAT-04: the suggested set has every group, category and tag, each named and linked', () => {
    const set = starterSet(names, newId)
    expect(set.groups).toHaveLength(starterGroups.length)
    expect(set.categories).toHaveLength(
      starterGroups.reduce((sum, group) => sum + group.categories.length, 0),
    )
    expect(set.tags).toHaveLength(starterTags.length)
    const groupIds = new Set(set.groups.map((group) => group.id))
    for (const item of set.categories) expect(groupIds.has(item.groupId)).toBe(true)
    // CAT-03: no two categories in a group share a name.
    for (const group of set.groups) {
      const inGroup = set.categories.filter((item) => item.groupId === group.id)
      expect(new Set(inGroup.map((item) => item.name)).size).toBe(inGroup.length)
    }
  })

  it('CAT-05: the set includes each system category exactly once', () => {
    const set = starterSet(names, newId)
    const keys = set.categories.flatMap((item) => item.systemKey ?? []).sort()
    expect(keys).toEqual(['adjustment', 'fees', 'interest', 'refunds', 'uncategorized'])
    // Refunds are money in; fees money out (CAT-02).
    expect(set.categories.find((item) => item.systemKey === 'refunds')?.kind).toBe('income')
    expect(set.categories.find((item) => item.systemKey === 'fees')?.kind).toBe('expense')
  })
})
