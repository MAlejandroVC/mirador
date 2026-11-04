import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { forgetUnlocked } from '../hooks/session'
import { useVault } from '../hooks/vault'
import { readAutoLock, shouldLock } from '../lib/auto-lock'

const checkEvery = 10 * 1000
const activity = ['pointerdown', 'keydown', 'wheel'] as const

// SEC-12: watches for use anywhere in the app and locks once the chosen time passes
// without any, or when the app leaves the screen if that's the choice. Locking drops
// the key from the worker's memory, so unlocking needs the password or a passkey.
export function AutoLock() {
  const vault = useVault()
  const router = useRouter()
  const queryClient = useQueryClient()

  useEffect(() => {
    let lastActivity = Date.now()
    let locking = false

    async function lock() {
      if (locking || (await vault.status()) !== 'unlocked') return
      locking = true
      try {
        await vault.lock()
        forgetUnlocked(queryClient)
        await router.navigate({ to: '/unlock' })
      } finally {
        locking = false
      }
    }

    function check() {
      if (shouldLock(readAutoLock(), lastActivity, Date.now(), document.hidden)) void lock()
    }

    function used() {
      lastActivity = Date.now()
    }

    // Timers barely run while the app is out of sight, so leaving and coming back are
    // checked straight away. Time away counts as time unused.
    const timer = setInterval(check, checkEvery)
    for (const name of activity) window.addEventListener(name, used, { passive: true })
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      for (const name of activity) window.removeEventListener(name, used)
      document.removeEventListener('visibilitychange', check)
    }
  }, [vault, router, queryClient])

  return null
}
