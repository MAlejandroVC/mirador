import { createFileRoute } from '@tanstack/react-router'
import { OneOffsScreen } from '../../../features/budget/one-offs-screen'

export const Route = createFileRoute('/_app/budget/one-offs')({
  component: OneOffsScreen,
})
