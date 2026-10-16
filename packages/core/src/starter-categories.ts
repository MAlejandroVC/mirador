import type {
  Category,
  CategoryGroup,
  CategoryKind,
  CuratedColor,
  Flexibility,
  SystemCategoryKey,
  Tag,
} from './categories.ts'

// CAT-04, CAT-05: the starter set offered when someone begins, which they can accept,
// edit or skip. It is only a suggestion: once created, every group, category and tag is
// the person's own record (CAT-10). Names come from the app's translations by key, so
// the set starts in the person's language.

interface StarterCategory {
  key: string
  icon: string
  flexibility: Flexibility
  kind?: CategoryKind
  systemKey?: SystemCategoryKey
}

interface StarterGroup {
  key: string
  color: CuratedColor
  kind: 'expense' | 'income'
  categories: StarterCategory[]
}

const item = (key: string, icon: string, flexibility: Flexibility): StarterCategory => ({
  key,
  icon,
  flexibility,
})

export const starterGroups: readonly StarterGroup[] = [
  {
    key: 'housing',
    color: 'marigold',
    kind: 'expense',
    categories: [
      item('rent', 'house', 'locked'),
      item('buildingFees', 'buildings', 'locked'),
      item('propertyTax', 'scroll', 'locked'),
      item('electricity', 'lightning', 'fixed'),
      item('water', 'drop', 'fixed'),
      item('homeGas', 'flame', 'fixed'),
      item('internet', 'wifiHigh', 'fixed'),
      item('phone', 'deviceMobile', 'fixed'),
      item('homeHelp', 'handHeart', 'fixed'),
      item('homeSupplies', 'broom', 'flexible'),
      item('repairs', 'hammer', 'flexible'),
      item('furniture', 'armchair', 'flexible'),
    ],
  },
  {
    key: 'food',
    color: 'lake',
    kind: 'expense',
    categories: [
      item('groceries', 'basket', 'fixed'),
      item('restaurants', 'forkKnife', 'flexible'),
      item('delivery', 'moped', 'flexible'),
      item('coffee', 'coffee', 'flexible'),
      item('snacks', 'cookie', 'flexible'),
      item('drinks', 'wine', 'flexible'),
    ],
  },
  {
    key: 'transportation',
    color: 'heather',
    kind: 'expense',
    categories: [
      item('fuel', 'gasPump', 'fixed'),
      item('publicTransport', 'train', 'fixed'),
      item('rides', 'taxi', 'flexible'),
      item('parking', 'car', 'flexible'),
      item('tolls', 'roadHorizon', 'fixed'),
      item('carMaintenance', 'wrench', 'flexible'),
      item('carInsurance', 'shieldCheck', 'locked'),
      item('carPaperwork', 'identificationCard', 'locked'),
      item('carWash', 'sparkle', 'flexible'),
    ],
  },
  {
    key: 'health',
    color: 'berry',
    kind: 'expense',
    categories: [
      item('doctor', 'stethoscope', 'fixed'),
      item('dentist', 'tooth', 'fixed'),
      item('pharmacy', 'pill', 'fixed'),
      item('healthInsurance', 'heartbeat', 'locked'),
      item('therapy', 'brain', 'fixed'),
      item('gym', 'barbell', 'flexible'),
    ],
  },
  {
    key: 'shopping',
    color: 'clay',
    kind: 'expense',
    categories: [
      item('clothes', 'tShirt', 'flexible'),
      item('personalCare', 'scissors', 'flexible'),
      item('electronics', 'laptop', 'flexible'),
      item('shopping', 'shoppingBag', 'flexible'),
      item('gifts', 'gift', 'flexible'),
      item('charity', 'heart', 'flexible'),
      item('work', 'briefcase', 'flexible'),
    ],
  },
  {
    key: 'family',
    color: 'bark',
    kind: 'expense',
    categories: [
      item('childCare', 'baby', 'locked'),
      item('kids', 'balloon', 'flexible'),
      item('education', 'graduationCap', 'fixed'),
      item('pets', 'pawPrint', 'fixed'),
    ],
  },
  {
    key: 'entertainment',
    color: 'plum',
    kind: 'expense',
    categories: [
      item('subscriptions', 'repeat', 'fixed'),
      item('movies', 'filmSlate', 'flexible'),
      item('events', 'ticket', 'flexible'),
      item('goingOut', 'confetti', 'flexible'),
      item('games', 'gameController', 'flexible'),
      item('hobbies', 'paintBrush', 'flexible'),
      item('books', 'books', 'flexible'),
    ],
  },
  {
    key: 'travel',
    color: 'lagoon',
    kind: 'expense',
    categories: [
      item('flights', 'airplaneTilt', 'flexible'),
      item('lodging', 'bed', 'flexible'),
      item('tripActivities', 'mapTrifold', 'flexible'),
    ],
  },
  {
    key: 'financial',
    color: 'dusk',
    kind: 'expense',
    categories: [
      { key: 'fees', icon: 'invoice', flexibility: 'fixed', systemKey: 'fees' },
      {
        key: 'interest',
        icon: 'percent',
        flexibility: 'fixed',
        kind: 'any',
        systemKey: 'interest',
      },
      item('taxes', 'receipt', 'locked'),
      item('insurance', 'umbrella', 'locked'),
    ],
  },
  {
    key: 'income',
    color: 'moss',
    kind: 'income',
    categories: [
      item('salary', 'money', 'fixed'),
      item('bonus', 'coins', 'flexible'),
      item('freelance', 'handCoins', 'flexible'),
      item('investmentReturns', 'chartLineUp', 'flexible'),
      item('rentalIncome', 'key', 'fixed'),
      item('governmentSupport', 'bank', 'fixed'),
      item('giftsReceived', 'gift', 'flexible'),
      { key: 'refunds', icon: 'arrowUUpLeft', flexibility: 'flexible', systemKey: 'refunds' },
    ],
  },
  {
    key: 'other',
    color: 'stone',
    kind: 'expense',
    categories: [
      {
        key: 'uncategorized',
        icon: 'questionMark',
        flexibility: 'flexible',
        kind: 'any',
        systemKey: 'uncategorized',
      },
      {
        key: 'adjustment',
        icon: 'scales',
        flexibility: 'fixed',
        kind: 'any',
        systemKey: 'adjustment',
      },
    ],
  },
]

/** The suggested tags (CAT-04): context a category can't give. */
export const starterTags: readonly { key: string; color: CuratedColor }[] = [
  { key: 'work', color: 'dusk' },
  { key: 'partner', color: 'berry' },
  { key: 'family', color: 'marigold' },
  { key: 'friends', color: 'lagoon' },
  { key: 'kids', color: 'meadow' },
  { key: 'trip', color: 'lake' },
  { key: 'reimbursable', color: 'stone' },
]

export interface StarterNames {
  group: (key: string) => string
  category: (key: string) => string
  tag: (key: string) => string
}

export interface CategorySet {
  groups: CategoryGroup[]
  categories: Category[]
  tags: Tag[]
}

/**
 * CAT-04: the whole starter set as new records, named in the person's language. With
 * `systemOnly` it is the start-from-scratch choice: just the system categories, which
 * every set needs (CAT-05), in the Other group.
 */
export function starterSet(
  names: StarterNames,
  newId: () => string,
  options: { systemOnly?: boolean } = {},
): CategorySet {
  const groups: CategoryGroup[] = []
  const categories: Category[] = []
  const chosen = options.systemOnly
    ? [
        {
          key: 'other',
          color: 'stone' as const,
          kind: 'expense' as const,
          categories: starterGroups.flatMap((group) =>
            group.categories.filter((category) => category.systemKey !== undefined),
          ),
        },
      ]
    : starterGroups
  for (const [groupOrder, group] of chosen.entries()) {
    const groupId = newId()
    groups.push({
      id: groupId,
      name: names.group(group.key),
      color: group.color,
      order: groupOrder,
    })
    for (const [order, category] of group.categories.entries())
      categories.push({
        id: newId(),
        name: names.category(category.key),
        groupId,
        kind:
          category.kind ??
          (category.systemKey === 'fees'
            ? 'expense'
            : category.systemKey === 'refunds'
              ? 'income'
              : group.kind),
        icon: category.icon,
        flexibility: category.flexibility,
        order,
        ...(category.systemKey ? { systemKey: category.systemKey } : {}),
      })
  }
  const tags = options.systemOnly
    ? []
    : starterTags.map((tag) => ({ id: newId(), name: names.tag(tag.key), color: tag.color }))
  return { groups, categories, tags }
}
