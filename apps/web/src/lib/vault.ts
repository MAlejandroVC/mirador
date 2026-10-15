import { wrap } from 'comlink'
import type { Vault } from '../worker/vault'

// What the screens use: the vault's methods, all asynchronous. In the app they run
// in the worker; tests pass a stand-in.
export type VaultClient = Pick<
  Vault,
  | 'status'
  | 'signUp'
  | 'signIn'
  | 'recover'
  | 'unlock'
  | 'lock'
  | 'signOut'
  | 'changePassword'
  | 'replaceRecoveryKey'
  | 'signOutOthers'
  | 'changeUsername'
  | 'deleteAccount'
  | 'startAddingPasskey'
  | 'addPasskey'
  | 'passkeySignInOptions'
  | 'openWithPasskey'
  | 'listRecords'
  | 'saveRecords'
>

export function startVault(): VaultClient {
  return wrap<Vault>(new Worker(new URL('../worker/index.ts', import.meta.url), { type: 'module' }))
}
