import { createFileRoute } from '@tanstack/react-router'
import { WhatIfsScreen } from '../../../features/budget/what-ifs-screen'

export const Route = createFileRoute('/_app/budget/what-ifs')({
  component: WhatIfsScreen,
})
