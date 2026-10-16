import { walletRecord } from '@repo/api'
import { reorderedWallets } from '@repo/core'
import { useTranslation } from 'react-i18next'
import { IconTile } from '../../components/ui/icon-tile'
import { ReorderSheet } from '../../components/ui/reorder-sheet'
import { type LedgerWallet, type RecordChange, useSaveRecords, walletBody } from './use-ledger'
import { walletIconComponents } from './wallet-look'

// WAL-10: the wallets in the person's order. Deleting a wallet is a bigger step that
// lives in Edit (WAL-08), so there is no swipe here.
export function WalletReorderSheet({
  open,
  wallets,
  onClose,
}: {
  open: boolean
  wallets: readonly LedgerWallet[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const save = useSaveRecords()
  return (
    <ReorderSheet
      open={open}
      title={t('wallets.reorder.title')}
      intro={t('wallets.reorder.intro')}
      items={wallets.map((wallet) => ({
        id: wallet.id,
        name: wallet.name,
        leading: <IconTile icon={walletIconComponents[wallet.icon]} color={wallet.color} />,
      }))}
      pending={save.isPending}
      failed={save.isError}
      onSave={(ids, done) => {
        const byId = new Map(wallets.map((wallet) => [wallet.id, wallet]))
        // Only the wallets whose place changed are saved.
        const changes: RecordChange[] = reorderedWallets(
          ids.flatMap((id) => byId.get(id) ?? []),
        ).map(({ id, ...wallet }) => ({ id, body: walletBody(walletRecord.parse(wallet)) }))
        if (changes.length === 0) onClose()
        else save.mutate(changes, { onSuccess: done })
      }}
      onClose={onClose}
    />
  )
}
