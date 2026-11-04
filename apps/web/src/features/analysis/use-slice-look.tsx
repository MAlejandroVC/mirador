import type { SliceBy } from '@repo/core'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconTile } from '../../components/ui/icon-tile'
import { FolderSimpleIcon, StorefrontIcon } from '../../components/ui/icons'
import { CategoryTile, TagDot } from '../categories/category-tile'
import { walletIconComponents } from '../wallets/wallet-look'
import type { MarkColor } from './chart-colors'
import type { Analysis } from './use-analysis'

/** What a slice of spending is called and how it looks (DL-COL-13: its own colors). */
export interface SliceLook {
  name: string
  leading: ReactNode
  color: MarkColor
}

export function useSliceLook(analysis: Analysis) {
  const { t } = useTranslation()
  const { lookups, wallets } = analysis
  return (by: SliceBy, key: string): SliceLook => {
    switch (by) {
      case 'category': {
        const category = lookups.categories.get(key)
        const group = category && lookups.groupOf(category)
        return {
          name: category?.name ?? t('analysis.unknown'),
          leading: category ? <CategoryTile category={category} group={group} /> : null,
          color: group?.color ?? 'stone',
        }
      }
      case 'group': {
        const group = lookups.groups.get(key)
        return {
          name: group?.name ?? t('analysis.unknown'),
          leading: <IconTile icon={FolderSimpleIcon} color={group?.color ?? 'stone'} />,
          color: group?.color ?? 'stone',
        }
      }
      case 'tag': {
        const tag = lookups.tags.get(key)
        return {
          name: tag?.name ?? t('analysis.unknown'),
          leading: (
            <span className="grid size-[2.125rem] shrink-0 place-items-center">
              <TagDot color={tag?.color ?? 'stone'} />
            </span>
          ),
          color: tag?.color ?? 'stone',
        }
      }
      case 'payee':
        // Payees have no color of their own, so they are drawn as one series in `brand`.
        return {
          name: lookups.payees.get(key)?.name ?? t('analysis.unknown'),
          leading: <IconTile icon={StorefrontIcon} />,
          color: 'brand',
        }
      case 'wallet': {
        const wallet = wallets.get(key)
        return {
          name: wallet?.name ?? t('analysis.unknown'),
          leading: wallet ? (
            <IconTile icon={walletIconComponents[wallet.icon]} color={wallet.color} />
          ) : null,
          color: wallet?.color ?? 'stone',
        }
      }
    }
  }
}
