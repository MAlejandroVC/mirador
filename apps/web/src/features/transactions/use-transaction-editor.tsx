import { type EntryType, isEntry, type Recurring, type Transaction } from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUndo } from '../../components/ui/use-undo'
import { TransactionSheet } from '../wallets/transaction-sheet'
import { transactionBody, useLedger, useSaveRecords } from '../wallets/use-ledger'
import { type EntryMode, EntrySheet } from './entry-sheet'

/**
 * Opening a transaction to change or delete it (TXN-01), wherever it is listed: an
 * expense, income or transfer opens its form; what a wallet made for itself, such as
 * an opening balance (WAL-05), opens the wallet's own sheet, which can also confirm a
 * new one, such as estimated interest (WAL-14). Deleting shows Undo (TXN-13). A
 * recurring transaction opens to be changed, and one date of one that asks first
 * opens to be checked (TXN-09, TXN-10).
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
  const [schedule, setSchedule] = useState<EntryMode | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)

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

  function openSeries(recurring: Recurring) {
    setOpened(null)
    setSchedule({ kind: 'series', recurring })
    setScheduleOpen(true)
  }

  function openDue(recurring: Recurring, date: string) {
    setSchedule({ kind: 'due', recurring, date })
    setScheduleOpen(true)
  }

  const systemWallet = system && ledger?.wallets.find((wallet) => wallet.id === system.walletId)
  const opensEntry = opened !== null && isEntry(opened.transaction.kind)

  return {
    open,
    openSeries,
    openDue,
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
            onOpenSeries={openSeries}
          />
        )}
        {schedule && (
          <EntrySheet
            open={scheduleOpen}
            mode={schedule}
            onClose={() => {
              setScheduleOpen(false)
            }}
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
