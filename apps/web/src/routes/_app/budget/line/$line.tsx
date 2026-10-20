import { createFileRoute } from '@tanstack/react-router'
import { LineScreen } from '../../../../features/budget/line-screen'

export const Route = createFileRoute('/_app/budget/line/$line')({
  component: Line,
})

function Line() {
  const { line } = Route.useParams()
  return <LineScreen line={line} />
}
