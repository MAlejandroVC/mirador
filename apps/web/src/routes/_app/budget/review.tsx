import { createFileRoute } from '@tanstack/react-router'
import { ReviewScreen } from '../../../features/budget/review-screen'

export const Route = createFileRoute('/_app/budget/review')({
  component: ReviewScreen,
})
