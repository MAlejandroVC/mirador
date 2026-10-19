import type { CategoryChange } from '@repo/core'
import type { Words } from './use-words'

/**
 * ANA-26, ANA-33: "Eating out is $980 above usual: 6 more purchases at about the
 * same price." The part that explains most of the difference leads.
 */
export function changeSentence(item: CategoryChange, name: string, words: Words): string {
  const { t } = words
  const amount = words.text(Math.abs(item.difference))
  const more = Math.round(item.count - item.usualCount)
  const share = (part: number) => (item.difference === 0 ? 0 : part / item.difference)
  if (item.difference > 0) {
    if (more > 0 && share(item.frequency) >= 0.7)
      return t('analysis.changed.moreOften', { name, amount, count: more })
    if (share(item.price) >= 0.7) return t('analysis.changed.pricier', { name, amount })
    return t('analysis.changed.both', { name, amount })
  }
  if (more < 0 && share(item.frequency) >= 0.7)
    return t('analysis.changed.lessOften', { name, amount, count: -more })
  return t('analysis.changed.less', { name, amount })
}
