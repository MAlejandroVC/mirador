import { createFileRoute } from '@tanstack/react-router'
import { WalletsScreen } from '../../../features/wallets'

export const Route = createFileRoute('/_app/wallets/')({
  component: WalletsScreen,
})
