import { createFileRoute } from '@tanstack/react-router'
import { HomeScreen } from '../../features/home'

export const Route = createFileRoute('/_app/')({
  component: HomeScreen,
})
