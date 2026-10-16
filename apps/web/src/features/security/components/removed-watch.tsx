import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { sessionQuery } from '../hooks/session'

// SYS-23: the operator can remove someone while the app is open on their phone. Each
// time the app comes back on screen it asks the server again, and a removed account
// goes to the one screen it still has.
export function RemovedWatch() {
  const router = useRouter()
  const queryClient = useQueryClient()

  useEffect(() => {
    async function check() {
      if (document.hidden) return
      const session = await queryClient.query({ ...sessionQuery, staleTime: 0 })
      if (session?.user.removed) await router.navigate({ to: '/removed' })
    }
    function onVisible() {
      void check().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router, queryClient])

  return null
}
