import { queryOptions } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import type { VaultClient } from '../../../lib/vault'
import { createPasskey, getPasskey } from '../lib/passkey'

// SYS-06: the signed-in user's passkeys. Nothing in the list is secret, so the page
// asks for it itself; it works while locked too.
export const passkeysQuery = queryOptions({
  queryKey: ['passkeys'],
  queryFn: () => api.passkeys(),
})

// The worker checks the password and talks to the server; the page asks the device for
// the passkey in between, since WebAuthn only works on the page.
export async function addPasskey(vault: VaultClient, password: string) {
  const { challengeId, options } = await vault.startAddingPasskey(password)
  const { response, prfOutput } = await createPasskey(options)
  try {
    await vault.addPasskey({ challengeId, response, prfOutput })
  } finally {
    // The worker got its own copy; this one isn't needed any more.
    prfOutput.fill(0)
  }
}

// SYS-06, SEC-12: signs in, or unlocks while signed in, with a passkey.
export async function openWithPasskey(vault: VaultClient) {
  const { challengeId, options } = await vault.passkeySignInOptions()
  const { response, prfOutput } = await getPasskey(options)
  try {
    await vault.openWithPasskey({ challengeId, response, prfOutput })
  } finally {
    prfOutput.fill(0)
  }
}
