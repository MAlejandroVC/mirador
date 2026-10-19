import { createFileRoute } from '@tanstack/react-router'
import { DataScreen } from '../../../features/data'

export const Route = createFileRoute('/_app/settings/data')({
  component: DataScreen,
})
