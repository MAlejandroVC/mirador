import type { ReactNode } from 'react'
import { useBack } from '../../components/shell/back'
import { IconTile } from '../../components/ui/icon-tile'
import type { Icon } from '../../components/ui/icons'
import { Page } from '../../components/ui/page'
import { useAnalysis, type Analysis } from './use-analysis'

/**
 * DL-CMP-06: a question's own screen, pushed in from Budget: a round back button, then
 * the header card with its icon, the question and one line on how it is answered.
 */
export function DetailPage({
  title,
  description,
  icon,
  leading,
  children,
}: {
  title: string
  description: string
  icon?: Icon
  /** A slice's own large tile, in place of `icon`. */
  leading?: ReactNode
  children: (analysis: Analysis) => ReactNode
}) {
  const analysis = useAnalysis()
  const back = useBack()
  return (
    <Page
      title={title}
      back={back}
      card={{
        icon: leading ?? (icon ? <IconTile icon={icon} size="large" /> : null),
        description,
      }}
    >
      {analysis && children(analysis)}
    </Page>
  )
}
