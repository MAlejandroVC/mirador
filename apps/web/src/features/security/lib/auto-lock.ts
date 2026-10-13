// SEC-12: how long Mirador waits, unused, before it locks and drops the key from
// memory. A choice per device, so it lives in this browser's storage: it is a setting,
// not user data, and nothing secret.

export const autoLockChoices = ['leave', 1, 5, 15, 60] as const
export type AutoLockChoice = (typeof autoLockChoices)[number]
export const defaultAutoLock: AutoLockChoice = 5

const storageKey = 'mirador.autoLock'

export function readAutoLock(): AutoLockChoice {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(storageKey)
  } catch {
    // Storage blocked (a private window, say): the default still locks.
  }
  return autoLockChoices.find((choice) => String(choice) === stored) ?? defaultAutoLock
}

export function saveAutoLock(choice: AutoLockChoice) {
  try {
    localStorage.setItem(storageKey, String(choice))
    return true
  } catch {
    return false
  }
}

// Pure, so the rule is tested apart from timers: lock once the set time has passed
// since the last tap or key press, or, for "leave", as soon as the app is out of sight.
export function shouldLock(
  choice: AutoLockChoice,
  lastActivity: number,
  now: number,
  hidden: boolean,
) {
  if (choice === 'leave') return hidden
  return now - lastActivity >= choice * 60 * 1000
}
