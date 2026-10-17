import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { forgetAll, forgetUnlocked, sessionQuery } from './session'

function cacheWithData() {
  const queryClient = new QueryClient()
  queryClient.setQueryData(sessionQuery.queryKey, null)
  queryClient.setQueryData(['wallets'], [{ name: 'Checking' }])
  queryClient.setQueryData(['transactions', '2026-10'], [{ amount: 1250 }])
  return queryClient
}

const keys = (queryClient: QueryClient) =>
  queryClient
    .getQueryCache()
    .getAll()
    .map((query) => query.queryKey[0])

describe('forgetting what was read while unlocked', () => {
  it('SEC-12: locking forgets the decrypted data and keeps who is signed in', () => {
    const queryClient = cacheWithData()

    forgetUnlocked(queryClient)

    expect(keys(queryClient)).toEqual(['session'])
  })

  it('SEC-12: signing out forgets everything', () => {
    const queryClient = cacheWithData()

    forgetAll(queryClient)

    expect(keys(queryClient)).toEqual([])
  })
})
