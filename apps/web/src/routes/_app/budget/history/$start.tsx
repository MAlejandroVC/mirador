import { createFileRoute } from '@tanstack/react-router'
import { MonthScreen } from '../../../../features/budget/month-screen'

export const Route = createFileRoute('/_app/budget/history/$start')({
  component: Month,
})

function Month() {
  const { start } = Route.useParams()
  return <MonthScreen start={start} />
}
