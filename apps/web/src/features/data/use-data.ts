import {
  archiveFile,
  archiveFileName,
  transactionsSpreadsheet,
  spreadsheetFileName,
} from '@repo/archive'
import { toCalendarDate } from '@repo/core'
import { type BuildResult, undoImport } from '@repo/import'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { sessionQuery } from '../security/hooks/session'
import { useVault } from '../security/hooks/vault'
import { saveFile } from '../security/lib/export'
import { type Ledger, ledgerKey, type RecordChange, useSaveRecords } from '../wallets/use-ledger'

// Epic 9: what Settings > Your data does. Every file is made and read here on the
// device from the decrypted records; the server only ever stores ciphertext (SEC-01).

export function useUsername() {
  const { data: session } = useSuspenseQuery(sessionQuery)
  return session?.user.username ?? ''
}

/** DAT-01: the whole account as one Mirador backup file. */
export function useDownloadBackup() {
  const vault = useVault()
  const username = useUsername()
  return useMutation({
    mutationFn: async () => {
      const now = new Date()
      saveFile(
        archiveFile(await vault.listRecords(), username, now),
        archiveFileName(username, toCalendarDate(now)),
      )
    },
  })
}

/** DAT-02: every transaction as one spreadsheet row. */
export function downloadSpreadsheet(ledger: Ledger) {
  saveFile(
    transactionsSpreadsheet(ledger),
    spreadsheetFileName(toCalendarDate(new Date())),
    'text/csv',
  )
}

/** Saves an import: the batch first, then what it made (IMP-34). */
export function useSaveImport() {
  return useSaveRecords()
}

/** IMP-35: removes exactly what one import added. */
export function useUndoImport() {
  const vault = useVault()
  const queryClient = useQueryClient()
  const save = useSaveRecords()
  return useMutation({
    mutationFn: async ({ batchId, ledger }: { batchId: string; ledger: Ledger }) => {
      const batch = ledger.batches.find((item) => item.id === batchId)
      if (!batch) return 0
      const types = new Map(
        (await vault.listRecords()).map((record) => [record.id, record.body.type]),
      )
      const { changes, removed } = undoImport(batchId, batch, {
        transactions: ledger.transactions,
        categories: ledger.categories,
        recurring: ledger.recurring,
        typeOf: (id) => types.get(id),
      })
      await save.mutateAsync(changes)
      return removed
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ledgerKey }),
  })
}

/** DAT-11: every record deleted, as when the account was new. */
export function useEraseAll() {
  const vault = useVault()
  const save = useSaveRecords()
  return useMutation({
    mutationFn: async () => {
      const changes: RecordChange[] = (await vault.listRecords())
        .filter((record) => !record.body.deleted)
        .map((record) => ({ id: record.id, body: { deleted: true, type: record.body.type } }))
      if (changes.length > 0) await save.mutateAsync(changes)
    },
  })
}

export type { BuildResult }
