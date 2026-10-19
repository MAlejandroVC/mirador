import { createFileRoute } from '@tanstack/react-router'
import { SliceScreen } from '../../../../features/analysis'

export const Route = createFileRoute('/_app/budget/$by/$id')({
  component: Slice,
})

function Slice() {
  const { by, id } = Route.useParams()
  return <SliceScreen by={by} id={id} />
}
