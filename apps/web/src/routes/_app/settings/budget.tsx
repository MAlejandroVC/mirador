import { createFileRoute } from '@tanstack/react-router'
import { BudgetSettingsScreen } from '../../../features/budget/settings-screen'

export const Route = createFileRoute('/_app/settings/budget')({
  component: BudgetSettingsScreen,
})
