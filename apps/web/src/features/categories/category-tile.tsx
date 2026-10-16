import type { CategoryIcon } from '@repo/api'
import type { Category, CategoryGroup } from '@repo/core'
import { IconTile } from '../../components/ui/icon-tile'
import { categoryIconComponents } from './category-icons'

// CAT-02, CAT-14, DL-ICO-02: a category shows as its icon in its category group's
// color. One whose group is gone takes Stone, the quietest color.
export function CategoryTile({
  category,
  group,
  size,
}: {
  category: Pick<Category, 'icon'>
  group: Pick<CategoryGroup, 'color'> | undefined
  size?: 'regular' | 'large'
}) {
  return (
    <IconTile
      icon={categoryIconComponents[category.icon as CategoryIcon]}
      color={group?.color ?? 'stone'}
      {...(size ? { size } : {})}
    />
  )
}

/** A tag's color dot (CAT-25, DL-COL-11). */
export function TagDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: `var(--mirador-${color})` }}
    />
  )
}
