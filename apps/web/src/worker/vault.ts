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
import type { RecordBody } from '@repo/api'
import { RecordsAltered, RecordSync } from '@repo/sync'
import { type Api, ApiError } from '../lib/api'
import { VaultError, vaultErrorCodes } from './errors'

export interface SignUpInput {
  username: string
  password: string
  setupCode?: string
}

// Holds the account key and the decrypted records. It runs in a Web Worker, so
// the key never sits on the page, and it keeps the key only in memory: a reload or
// lock drops it, and unlocking derives it again from the password (SEC-02, SEC-12).
export class Vault {
  // Holds the account key and the decrypted records, in this worker's memory only
  // (SEC-01); null while locked.
  #records: RecordSync | null = null

  constructor(private readonly api: Api) {}

  status(): Promise<'locked' | 'unlocked'> {
    return Promise.resolve(this.#records ? 'unlocked' : 'locked')
  }

  // Fetches what other devices changed since the last pull. Returns the changed ids.
  async pullRecords() {
    return guard(() => this.#sync().pull())
  }

  // Encrypts and saves records; see RecordSync.save.
  async saveRecords(records: { id: string; body: RecordBody }[]) {
    return guard(() => this.#sync().save(records))
  }

  async listRecords() {
    return guard(() => Promise.resolve(this.#sync().all()))
  }

  #sync() {
    if (!this.#records) throw new VaultError('locked')
    return this.#records
  }

  // Unlocked: keeps the key and loads every record it can now decrypt.
  async #open(accountKey: CryptoKey) {
    const session = await this.api.session()
    if (!session) throw new VaultError('signed-out')
    const records = new RecordSync(
      {
        pull: (after) => this.api.pullRecords(after),
        push: (changes) => this.api.pushRecords(changes),
      },
      accountKey,
      session.user.id,
    )
    await records.pull()
    this.#records = records
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
      await this.#open(accountKey)
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
      await this.#open(
        await unwrapAccountKey(keys.wrappedAccountKey, keyEncryptionKey).catch(() => {
          throw new VaultError('unsafe-server')
        }),
      )
    })
  }

  async unlock(password: string) {
    return guard(async () => {
      const keys = await this.api.keys()
      const { keyEncryptionKey } = await derivePasswordKeys(password, keys.kdf)
      await this.#open(await unwrapAccountKey(keys.wrappedAccountKey, keyEncryptionKey))
    })
  }

  lock() {
    this.#records = null
    return Promise.resolve()
  }

  async signOut() {
    this.#records = null
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
    // SEC-04: the server altered or swapped a record; say so rather than show it.
    if (error instanceof RecordsAltered) throw new VaultError('unsafe-server')
    if (error instanceof ApiError) {
      if (error.status === 401) throw new VaultError('signed-out')
      if (error.status === 429) throw new VaultError('too-many-attempts')
      const code = vaultErrorCodes.find((known) => known === error.code)
      throw new VaultError(code ?? 'unknown')
    }
    if (error instanceof TypeError) throw new VaultError('network')
    throw new VaultError('unknown')
  }
}
