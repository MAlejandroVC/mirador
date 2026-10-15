import type { Transaction } from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUndo } from '../../components/ui/use-undo'
import { TransactionSheet } from './transaction-sheet'
import { type LedgerWallet, transactionBody, useSaveRecords } from './use-ledger'

/**
 * WAL-05: opening a transaction to change or delete it, and confirming a new one such
 * as estimated interest (WAL-14). Returns `open` and the sheet to render.
 */
export function useTransactionEditor(wallet: LedgerWallet | undefined, defaultCurrency: string) {
  const { t } = useTranslation()
  const save = useSaveRecords()
  const undo = useUndo()
  const [opened, setOpened] = useState<{ transaction: Transaction; isNew: boolean } | null>(null)

  function remove(transaction: Transaction) {
    const { id, ...record } = transaction
    setOpened(null)
    save.mutate([{ id, body: { deleted: true, type: 'transaction' } }], {
      onSuccess: () => {
        undo({
          message: t('wallets.transactions.deleted'),
          undo: () => {
            save.mutate([{ id, body: transactionBody(record) }])
          },
        })
      },
    })
  }

  return {
    open: (transaction: Transaction, isNew = false) => {
      setOpened({ transaction, isNew })
    },
    sheet: wallet && (
      <TransactionSheet
        transaction={opened?.transaction ?? null}
        isNew={opened?.isNew ?? false}
        wallet={wallet}
        defaultCurrency={defaultCurrency}
        onClose={() => {
          setOpened(null)
        }}
        onDelete={remove}
      />
    ),
  }
}
