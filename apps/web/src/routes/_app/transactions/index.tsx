import type { PeriodScope } from '@repo/core'
import { createFileRoute } from '@tanstack/react-router'
import { TransactionsScreen, type TransactionsSearch } from '../../../features/transactions'

const scopes: readonly string[] = ['week', 'month', 'quarter', 'year']
const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)

export const Route = createFileRoute('/_app/transactions/')({
  // ANA-04: a chart in Budget opens the list on its period, filtered to what it shows.
  validateSearch: (search: Record<string, unknown>): TransactionsSearch => {
    const date = text(search.date)
    const scope = text(search.scope)
    return {
      ...(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : {}),
      ...(scope && scopes.includes(scope) ? { scope: scope as PeriodScope } : {}),
      ...(text(search.wallet) ? { wallet: text(search.wallet) } : {}),
      ...(text(search.group) ? { group: text(search.group) } : {}),
      ...(text(search.category) ? { category: text(search.category) } : {}),
      ...(text(search.tag) ? { tag: text(search.tag) } : {}),
      ...(text(search.payee) ? { payee: text(search.payee) } : {}),
    }
  },
  component: Transactions,
})

function Transactions() {
  const search = Route.useSearch()
  // A new drill-down starts the screen afresh rather than keeping the last filters.
  return <TransactionsScreen key={JSON.stringify(search)} search={search} />
}
