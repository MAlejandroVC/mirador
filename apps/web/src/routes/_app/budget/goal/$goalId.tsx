import { createFileRoute } from '@tanstack/react-router'
import { GoalScreen } from '../../../../features/budget/goal-screen'

export const Route = createFileRoute('/_app/budget/goal/$goalId')({
  component: Goal,
})

function Goal() {
  const { goalId } = Route.useParams()
  return <GoalScreen goalId={goalId} />
}
