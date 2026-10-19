import type { CategoryChange } from '@repo/core'
import type { Words } from './use-words'

/**
 * ANA-26, ANA-33: "$980 above usual: 6 more purchases at about the same price", said
 * under the category's name. The part that explains most of the difference leads.
 */
export function changeSentence(item: CategoryChange, words: Words): string {
  const { t } = words
  const amount = words.text(Math.abs(item.difference))
  const more = Math.round(item.count - item.usualCount)
  const share = (part: number) => (item.difference === 0 ? 0 : part / item.difference)
  if (item.difference > 0) {
    if (more > 0 && share(item.frequency) >= 0.7)
      return t('analysis.changed.moreOften', { amount, count: more })
    if (share(item.price) >= 0.7) return t('analysis.changed.pricier', { amount })
    return t('analysis.changed.both', { amount })
  }
  if (more < 0 && share(item.frequency) >= 0.7)
    return t('analysis.changed.lessOften', { amount, count: -more })
  return t('analysis.changed.less', { amount })
}
