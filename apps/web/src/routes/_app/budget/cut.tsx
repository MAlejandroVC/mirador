import { createFileRoute } from '@tanstack/react-router'
import { CutScreen } from '../../../features/analysis'

export const Route = createFileRoute('/_app/budget/cut')({
  component: CutScreen,
})
