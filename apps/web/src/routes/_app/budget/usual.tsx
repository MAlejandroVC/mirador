import { createFileRoute } from '@tanstack/react-router'
import { UsualScreen } from '../../../features/budget/usual-screen'

export const Route = createFileRoute('/_app/budget/usual')({
  component: UsualScreen,
})
