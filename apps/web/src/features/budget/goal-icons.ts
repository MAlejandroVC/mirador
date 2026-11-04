import type { GoalKind } from '@repo/core'
import {
  ChartBarIcon,
  CreditCardIcon,
  type Icon,
  LifebuoyIcon,
  PiggyBankIcon,
  ShoppingBagIcon,
} from '../../components/ui/icons'

/** BUD-20: each kind of goal's icon, shaded only where the drawing encloses it (DL-ICO-03). */
export const goalIcons: Record<GoalKind, Icon> = {
  save: PiggyBankIcon,
  debt: CreditCardIcon,
  // DL-ICO-03: bars for investments.
  invest: ChartBarIcon,
  emergency: LifebuoyIcon,
  afford: ShoppingBagIcon,
}
