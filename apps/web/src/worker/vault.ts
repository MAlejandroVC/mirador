import {
  createAccountKey,
  deriveRecoveryKeys,
  derivePasswordKeys,
  formatRecoveryKey,
  newKdfParams,
  newRecoveryKey,
  unwrapAccountKey,
  WeakKdfParamsError,
  WrongKeyError,
} from '@repo/crypto'
import { type Api, ApiError } from '../lib/api'
import { VaultError, vaultErrorCodes } from './errors'

export interface SignUpInput {
  username: string
  password: string
  setupCode?: string
}

// Holds the account key and, later, the decrypted data. It runs in a Web Worker, so
// the key never sits on the page, and it keeps the key only in memory: a reload or
// lock drops it, and unlocking derives it again from the password (SEC-02, SEC-12).
export class Vault {
  #accountKey: CryptoKey | null = null

  constructor(private readonly api: Api) {}

  status(): Promise<'locked' | 'unlocked'> {
    return Promise.resolve(this.#accountKey ? 'unlocked' : 'locked')
  }

  // SEC-02, SEC-07: everything is made here; the server gets the login secret, the
  // wrapped account key and a recovery secret, none of which can decrypt anything.
  // Returns the recovery key to show once.
  async signUp({ username, password, setupCode }: SignUpInput) {
    username = normalizeUsername(username)
    return guard(async () => {
      const kdf = newKdfParams()
      const recoveryKey = newRecoveryKey()
      const [{ loginSecret, keyEncryptionKey }, { recoverySecret, recoveryWrappingKey }] =
        await Promise.all([derivePasswordKeys(password, kdf), deriveRecoveryKeys(recoveryKey)])
      const { accountKey, wrappedByPassword, wrappedByRecovery } = await createAccountKey(
        keyEncryptionKey,
        recoveryWrappingKey,
      )
      await this.api.signUp({
        username,
        loginSecret,
        kdf,
        wrappedAccountKey: { password: wrappedByPassword, recovery: wrappedByRecovery },
        recoverySecret,
        ...(setupCode ? { setupCode } : {}),
      })
      this.#accountKey = accountKey
      const shown = await formatRecoveryKey(recoveryKey)
      recoveryKey.fill(0)
      return { recoveryKey: shown }
    })
  }

  // SEC-03: the server learns the login secret, not the password.
  async signIn(username: string, password: string) {
    username = normalizeUsername(username)
    return guard(async () => {
      const { kdf } = await this.api.prelogin(username)
      const { loginSecret, keyEncryptionKey } = await derivePasswordKeys(password, kdf)
      try {
        await this.api.signIn(username, loginSecret)
      } catch (error) {
        throw error instanceof ApiError && error.status === 401
          ? new VaultError('wrong-credentials')
          : error
      }
      const keys = await this.api.keys()
      // The password just signed in, so settings that changed in between or a key
      // that won't open with it were altered on the server.
      if (JSON.stringify(keys.kdf) !== JSON.stringify(kdf)) throw new VaultError('unsafe-server')
      this.#accountKey = await unwrapAccountKey(keys.wrappedAccountKey, keyEncryptionKey).catch(
        () => {
          throw new VaultError('unsafe-server')
        },
      )
    })
  }

  async unlock(password: string) {
    return guard(async () => {
      const keys = await this.api.keys()
      const { keyEncryptionKey } = await derivePasswordKeys(password, keys.kdf)
      this.#accountKey = await unwrapAccountKey(keys.wrappedAccountKey, keyEncryptionKey)
    })
  }

  lock() {
    this.#accountKey = null
    return Promise.resolve()
  }

  async signOut() {
    this.#accountKey = null
    await guard(() => this.api.signOut())
  }
}

// The server keeps usernames in lower case; the same here keeps typed variants equal.
function normalizeUsername(username: string) {
  return username.trim().toLowerCase()
}

// Turns every failure into a VaultError the screens can explain.
async function guard<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    if (error instanceof VaultError) throw error
    if (error instanceof WeakKdfParamsError) throw new VaultError('unsafe-server')
    if (error instanceof WrongKeyError) throw new VaultError('wrong-password')
    if (error instanceof ApiError) {
      if (error.status === 401) throw new VaultError('signed-out')
      // Better Auth limits sign-in attempts per address.
      if (error.status === 429) throw new VaultError('too-many-attempts')
      const code = vaultErrorCodes.find((known) => known === error.code)
      throw new VaultError(code ?? 'unknown')
    }
    if (error instanceof TypeError) throw new VaultError('network')
    throw new VaultError('unknown')
  }
}
