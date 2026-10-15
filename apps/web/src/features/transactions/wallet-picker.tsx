import { useTranslation } from 'react-i18next'
import { ChoiceRow } from '../../components/ui/choice-row'
import { IconTile } from '../../components/ui/icon-tile'
import { List } from '../../components/ui/list'
import { Sheet } from '../../components/ui/sheet'
import { useMoney } from '../../lib/format'
import type { LedgerWallet } from '../wallets/use-ledger'
import { walletIconComponents } from '../wallets/wallet-look'

/**
 * Picking the wallet of a transaction, from a sheet over the form (DL-CMP-09): the
 * active wallets only (WAL-04), each with its balance so the right one is easy to
 * spot. Picking one closes it.
 */
export function WalletPicker({
  open,
  title,
  wallets,
  balances,
  value,
  defaultCurrency,
  onChoose,
  onClose,
}: {
  open: boolean
  title: string
  wallets: readonly LedgerWallet[]
  balances: ReadonlyMap<string, number>
  value: string | null
  defaultCurrency: string
  onChoose: (walletId: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const money = useMoney(defaultCurrency)
  return (
    <Sheet open={open} title={title} cancelLabel={t('nav.cancel')} onClose={onClose}>
      {open && (
        <List inset>
          {wallets.map((wallet) => {
            const balance = { minor: balances.get(wallet.id) ?? 0, currency: wallet.currency }
            return (
              <ChoiceRow
                key={wallet.id}
                role="radio"
                leading={<IconTile icon={walletIconComponents[wallet.icon]} color={wallet.color} />}
                title={wallet.name}
                subtitle={money.text(balance)}
                checked={wallet.id === value}
                onToggle={() => {
                  onChoose(wallet.id)
                }}
              />
            )
          })}
        </List>
      )}
    </Sheet>
  )
}
