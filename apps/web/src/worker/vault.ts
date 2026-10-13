import {
  createAccountKey,
  derivePasskeyKey,
  deriveRecoveryKeys,
  derivePasswordKeys,
  formatRecoveryKey,
  newKdfParams,
  newRecoveryKey,
  parseRecoveryKey,
  RecoveryKeyTypoError,
  rewrapAccountKey,
  unwrapAccountKey,
  WeakKdfParamsError,
  WrongKeyError,
} from '@repo/crypto'
import type {
  AuthenticationResponse,
  KeysResponse,
  RecordBody,
  RegistrationResponse,
} from '@repo/api'
import { RecordsAltered, RecordSync } from '@repo/sync'
import { type Api, ApiError } from '../lib/api'
import { VaultError, vaultErrorCodes } from './errors'

export interface RecoverInput {
  username: string
  recoveryKey: string
  newPassword: string
}

// What the page brings back from the passkey (SYS-06): its answer for the server, and
// the PRF secret, which stays in this worker.
export interface PasskeyAnswer<Response> {
  challengeId: string
  response: Response
  prfOutput: Uint8Array
}

export interface SignUpInput {
  username: string
  password: string
  setupCode?: string
  inviteCode?: string
}

// Holds the account key and the decrypted records. It runs in a Web Worker, so
// the key never sits on the page, and it keeps the key only in memory: a reload or
// lock drops it, and unlocking derives it again from the password (SEC-02, SEC-12).
export class Vault {
  // Holds the account key and the decrypted records, in this worker's memory only
  // (SEC-01); null while locked.
  #records: RecordSync | null = null
  // SYS-06: the checked password's keys, between asking for it and the passkey's answer.
  #passkeyPassword: {
    loginSecret: string
    keyEncryptionKey: CryptoKey
    keys: KeysResponse
  } | null = null

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
  async signUp({ username, password, setupCode, inviteCode }: SignUpInput) {
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
        ...(inviteCode ? { inviteCode } : {}),
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

  // SEC-07: a forgotten password. The recovery key opens the account key here, and a
  // new password wraps it again; the server gets only the recovery secret and the new
  // login secret. Every other device is signed out; the recovery key keeps working.
  async recover({ username, recoveryKey, newPassword }: RecoverInput) {
    username = normalizeUsername(username)
    return guard(async () => {
      const bytes = await parseRecoveryKey(recoveryKey)
      const { recoverySecret, recoveryWrappingKey } = await deriveRecoveryKeys(bytes)
      bytes.fill(0)
      let wrapped: string
      try {
        ;({ wrappedAccountKey: wrapped } = await this.api.recoveryKey(username, recoverySecret))
      } catch (error) {
        throw error instanceof ApiError && error.status === 401
          ? new VaultError('wrong-recovery-key')
          : error
      }
      const kdf = newKdfParams()
      const { loginSecret, keyEncryptionKey } = await derivePasswordKeys(newPassword, kdf)
      // The server accepted the recovery secret, so a key that won't open with the
      // recovery key was altered there.
      const { accountKey, rewrapped } = await rewrapAccountKey(
        wrapped,
        recoveryWrappingKey,
        keyEncryptionKey,
      ).catch(() => {
        throw new VaultError('unsafe-server')
      })
      await this.api.recover({
        username,
        recoverySecret,
        loginSecret,
        kdf,
        wrappedAccountKey: rewrapped,
      })
      await this.#open(accountKey)
    })
  }

  // SEC-08: a new password wraps the same account key, so nothing is encrypted again.
  // The current password must open the key here and sign in on the server too. Other
  // devices are signed out; this one stays signed in and unlocked.
  async changePassword(currentPassword: string, newPassword: string) {
    return guard(async () => {
      this.#sync()
      const { current, keys } = await this.#currentPassword(currentPassword)
      const kdf = newKdfParams()
      const fresh = await derivePasswordKeys(newPassword, kdf)
      const { rewrapped } = await rewrapAccountKey(
        keys.wrappedAccountKey,
        current.keyEncryptionKey,
        fresh.keyEncryptionKey,
      )
      await this.api.changePassword({
        loginSecret: current.loginSecret,
        newLoginSecret: fresh.loginSecret,
        kdf,
        wrappedAccountKey: rewrapped,
      })
    })
  }

  // SEC-08: a new recovery key wraps the same account key, and the old key stops
  // working. Returns the new key to show once, like at sign-up.
  async replaceRecoveryKey(password: string) {
    return guard(async () => {
      this.#sync()
      const { current, keys } = await this.#currentPassword(password)
      const recoveryKey = newRecoveryKey()
      const { recoverySecret, recoveryWrappingKey } = await deriveRecoveryKeys(recoveryKey)
      const { rewrapped } = await rewrapAccountKey(
        keys.wrappedAccountKey,
        current.keyEncryptionKey,
        recoveryWrappingKey,
      )
      await this.api.replaceRecoveryKey({
        loginSecret: current.loginSecret,
        recoverySecret,
        wrappedAccountKey: rewrapped,
      })
      const shown = await formatRecoveryKey(recoveryKey)
      recoveryKey.fill(0)
      return { recoveryKey: shown }
    })
  }

  // SYS-06: a new username. The keys don't depend on it, so only the name changes; the
  // current password is checked here first, then proven to the server.
  async changeUsername(newUsername: string, password: string) {
    newUsername = normalizeUsername(newUsername)
    return guard(async () => {
      this.#sync()
      const { current } = await this.#currentPassword(password)
      await this.api.changeUsername({ username: newUsername, loginSecret: current.loginSecret })
    })
  }

  // SEC-08: ends every session but this device's. Returns how many devices.
  async signOutOthers() {
    return guard(async () => (await this.api.signOutOthers()).signedOut)
  }

  // SYS-06: the first half of adding a passkey. The password is checked here before
  // the browser makes the passkey, so a typo doesn't leave a passkey on the device
  // that this account never saved. Returns the server's options for the passkey.
  async startAddingPasskey(password: string) {
    this.#passkeyPassword = null
    return guard(async () => {
      this.#sync()
      const { current, keys } = await this.#currentPassword(password)
      const options = await this.api.passkeyRegistration()
      this.#passkeyPassword = { ...current, keys }
      return options
    })
  }

  // SYS-06: the passkey's PRF secret wraps the same account key the password does, so
  // either opens the data. The server gets that wrapped key and the passkey's public
  // half, never the secret, and checks the current password once more.
  async addPasskey({ challengeId, response, prfOutput }: PasskeyAnswer<RegistrationResponse>) {
    const password = this.#passkeyPassword
    this.#passkeyPassword = null
    return guard(async () => {
      this.#sync()
      if (!password) throw new VaultError('unknown')
      const passkeyKey = await derivePasskeyKey(prfOutput)
      prfOutput.fill(0)
      const { rewrapped } = await rewrapAccountKey(
        password.keys.wrappedAccountKey,
        password.keyEncryptionKey,
        passkeyKey,
      )
      await this.api.addPasskey({
        challengeId,
        response,
        loginSecret: password.loginSecret,
        wrappedAccountKey: rewrapped,
      })
    })
  }

  // The server's challenge for signing in or unlocking with a passkey.
  async passkeySignInOptions() {
    return guard(() => this.api.passkeySignInOptions())
  }

  // SYS-06, SEC-12: signs in, or unlocks while signed in, with a passkey instead of the
  // password. The server checks the passkey's signature and returns the account key
  // wrapped by its secret, which only this passkey's PRF secret can open.
  async openWithPasskey({
    challengeId,
    response,
    prfOutput,
  }: PasskeyAnswer<AuthenticationResponse>) {
    return guard(async () => {
      const passkeyKey = await derivePasskeyKey(prfOutput)
      prfOutput.fill(0)
      const { wrappedAccountKey } = await this.api.passkeySignIn({ challengeId, response })
      // The server accepted the passkey, so a key that won't open with it was altered there.
      await this.#open(
        await unwrapAccountKey(wrappedAccountKey, passkeyKey).catch(() => {
          throw new VaultError('unsafe-server')
        }),
      )
    })
  }

  // The current password's keys, checked against the wrapped key before anything is
  // sent, so a typo is caught here (WrongKeyError) rather than counted by the server.
  async #currentPassword(password: string) {
    const keys = await this.api.keys()
    const current = await derivePasswordKeys(password, keys.kdf)
    await unwrapAccountKey(keys.wrappedAccountKey, current.keyEncryptionKey)
    return { current, keys }
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
    this.#passkeyPassword = null
    return Promise.resolve()
  }

  async signOut() {
    this.#records = null
    this.#passkeyPassword = null
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
    if (error instanceof RecoveryKeyTypoError) throw new VaultError('recovery-key-typo')
    if (error instanceof WrongKeyError) throw new VaultError('wrong-password')
    // SEC-04: the server altered or swapped a record; say so rather than show it.
    if (error instanceof RecordsAltered) throw new VaultError('unsafe-server')
    if (error instanceof ApiError) {
      // The server's own code first: a 401 can be a wrong password, not only signed out.
      const code = vaultErrorCodes.find((known) => known === error.code)
      if (code) throw new VaultError(code)
      if (error.status === 401) throw new VaultError('signed-out')
      if (error.status === 429) throw new VaultError('too-many-attempts')
      throw new VaultError('unknown')
    }
    if (error instanceof TypeError) throw new VaultError('network')
    throw new VaultError('unknown')
  }
}
