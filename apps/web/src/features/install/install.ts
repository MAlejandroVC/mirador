import { useEffect, useState } from 'react'

// SYS-20: adding Mirador to the Home Screen, so it opens full screen like an app (the
// web app manifest is in public/). Chrome and Edge offer their own install prompt
// through `beforeinstallprompt`; Safari has no such API, so on iPhone and iPad the app
// can only show the steps.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** `prompt`: the browser's own install dialog; `ios`, `android`: show the steps. */
export type InstallWay = 'prompt' | 'ios' | 'android' | null

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of listeners) listener()
}

// Listened for from the first import, since the browser fires it once, early.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's mini bar away; the person installs from Settings instead.
    event.preventDefault()
    deferred = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

/** Already opened from the Home Screen, full screen. */
export function isInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos() {
  const { userAgent, maxTouchPoints } = navigator
  // iPadOS asks for desktop sites and reports a Mac, but a Mac has no touch screen.
  return (
    /iPhone|iPad|iPod/.test(userAgent) || (userAgent.includes('Macintosh') && maxTouchPoints > 1)
  )
}

export function installWay(): InstallWay {
  if (isInstalled()) return null
  if (deferred) return 'prompt'
  if (isIos()) return 'ios'
  if (navigator.userAgent.includes('Android')) return 'android'
  // A computer browser without an install prompt: nothing to offer.
  return null
}

export function useInstallWay() {
  const [way, setWay] = useState(installWay)
  useEffect(() => {
    const update = () => {
      setWay(installWay())
    }
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])
  return way
}

/** Opens the browser's own install dialog, once. */
export async function promptInstall() {
  const event = deferred
  if (!event) return
  deferred = null
  await event.prompt()
  await event.userChoice
  notify()
}
