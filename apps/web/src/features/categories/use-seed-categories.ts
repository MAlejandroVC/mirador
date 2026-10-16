import { useEffect, useRef } from 'react'
import { useLedger } from '../wallets/use-ledger'
import { useStartCategories } from './use-start-categories'

/**
 * CAT-04, CAT-05: every account starts with the suggested categories, ready to change,
 * the way the app starts with a palette (DL-PRI-04: works out of the box). They
 * are added once, the first time the ledger has none; the vault only opens after it
 * pulled every record, so another device's set is already there.
 */
export function useSeedCategories() {
  const { data: ledger } = useLedger()
  const starter = useStartCategories()
  const started = useRef(false)
  useEffect(() => {
    if (!ledger || started.current) return
    if (ledger.categories.length > 0 || ledger.groups.length > 0) return
    started.current = true
    starter.start()
  }, [ledger, starter])
}
