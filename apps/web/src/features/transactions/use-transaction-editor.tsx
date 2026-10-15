import { type EntryType, isEntry, type Transaction } from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUndo } from '../../components/ui/use-undo'
import { TransactionSheet } from '../wallets/transaction-sheet'
import { transactionBody, useLedger, useSaveRecords } from '../wallets/use-ledger'
import { EntrySheet } from './entry-sheet'

/**
 * Opening a transaction to change or delete it (TXN-01), wherever it is listed: an
 * expense, income or transfer opens its form; what a wallet made for itself, such as
 * an opening balance (WAL-05), opens the wallet's own sheet, which can also confirm a
 * new one, such as estimated interest (WAL-14). Deleting shows Undo (TXN-13).
 */
export function useTransactionEditor() {
  const { t } = useTranslation()
  const { data: ledger } = useLedger()
  const save = useSaveRecords()
  const undo = useUndo()
  const [opened, setOpened] = useState<{ transaction: Transaction; isNew: boolean } | null>(null)
  // Kept while a sheet slides away, so it leaves showing what it showed.
  const [entry, setEntry] = useState<(Transaction & { kind: EntryType }) | null>(null)
  const [system, setSystem] = useState<Transaction | null>(null)

  function remove(transaction: Transaction) {
    const { id, ...record } = transaction
    setOpened(null)
    save.mutate([{ id, body: { deleted: true, type: 'transaction' } }], {
      onSuccess: () => {
        undo({
          message: t('transactions.deleted'),
          seconds: 10,
          undo: () => {
            save.mutate([{ id, body: transactionBody(record) }])
          },
        })
      },
    })
  }

  function open(transaction: Transaction, isNew = false) {
    setOpened({ transaction, isNew })
    if (isEntry(transaction.kind)) setEntry({ ...transaction, kind: transaction.kind })
    else setSystem(transaction)
  }

  const systemWallet = system && ledger?.wallets.find((wallet) => wallet.id === system.walletId)
  const opensEntry = opened !== null && isEntry(opened.transaction.kind)

  return {
    open,
    remove,
    sheet: (
      <>
        {entry && (
          <EntrySheet
            open={opensEntry}
            mode={{ kind: 'edit', transaction: entry }}
            onClose={() => {
              setOpened(null)
            }}
            onDelete={remove}
          />
        )}
        {systemWallet && (
          <TransactionSheet
            transaction={opened && !opensEntry ? opened.transaction : null}
            isNew={opened?.isNew ?? false}
            wallet={systemWallet}
            defaultCurrency={ledger?.defaultCurrency ?? 'USD'}
            onClose={() => {
              setOpened(null)
            }}
            onDelete={remove}
          />
        )}
      </>
    ),
  }
}
