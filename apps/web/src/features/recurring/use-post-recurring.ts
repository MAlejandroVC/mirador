import { recurringRecord, recurringRecordType, transactionRecord } from '@repo/api'
import { dueDates, occurrenceFields, type Recurring, toCalendarDate } from '@repo/core'
import { useEffect, useRef } from 'react'
import {
  type Ledger,
  newId,
  type RecordChange,
  recordBody,
  transactionBody,
  useLedger,
  useSaveRecords,
} from '../wallets/use-ledger'

/** A recurring transaction saved as it is, with only what changed. */
export function recurringChange(
  recurring: Recurring,
  patch: Partial<Omit<Recurring, 'id'>> = {},
): RecordChange {
  const { id, ...record } = recurring
  return {
    id,
    body: recordBody(recurringRecordType, recurringRecord.parse({ ...record, ...patch })),
  }
}

/**
 * TXN-10: what the device adds now: every date that came due for the recurring
 * transactions that don't ask first, each marked with its date, and the last one
 * handled. Those whose wallet is gone wait (WAL-08 removes them with it).
 */
export function dueChanges(ledger: Ledger, today: string, now: string): RecordChange[] {
  const wallets = new Set(ledger.wallets.map((wallet) => wallet.id))
  const changes: RecordChange[] = []
  for (const recurring of ledger.recurring) {
    if (recurring.ask || !wallets.has(recurring.walletId)) continue
    if (recurring.toWalletId !== undefined && !wallets.has(recurring.toWalletId)) continue
    const dates = dueDates(recurring, today)
    const last = dates.at(-1)
    if (last === undefined) continue
    for (const date of dates)
      changes.push({
        id: newId(),
        body: transactionBody(transactionRecord.parse(occurrenceFields(recurring, date, now))),
      })
    changes.push(recurringChange(recurring, { handled: last }))
  }
  return changes
}

/**
 * TXN-10: the server can't add encrypted transactions, so the app adds what came due
 * each time it opens, and again whenever the records change, such as after a sync.
 */
export function usePostRecurring() {
  const { data: ledger } = useLedger()
  const save = useSaveRecords()
  const busy = useRef(false)
  useEffect(() => {
    if (!ledger || busy.current) return
    const changes = dueChanges(ledger, toCalendarDate(new Date()), new Date().toISOString())
    if (changes.length === 0) return
    busy.current = true
    save.mutate(changes, {
      onSettled: () => {
        busy.current = false
      },
    })
  }, [ledger, save])
}
