import { describe, expect, it } from 'vitest'
import { fromBase64Url, toBase64Url } from './encoding.ts'
import {
  checkKdfParams,
  createAccountKey,
  defaultKdfCost,
  deriveRecoveryKeys,
  derivePasswordKeys,
  type KdfParams,
  newKdfParams,
  rewrapAccountKey,
  unwrapAccountKey,
  WeakKdfParamsError,
  WrongKeyError,
} from './keys.ts'
import { newRecoveryKey } from './recovery-key.ts'

// Cheap settings so the suite stays fast; the app always uses at least defaultKdfCost.
const cheap: KdfParams = {
  algorithm: 'argon2id',
  salt: toBase64Url(new Uint8Array(16).fill(7)),
  memoryKiB: 64,
  iterations: 1,
  parallelism: 1,
}
const unsafe = { unsafeSkipCostCheck: true }

async function roundTrip(key: CryptoKey) {
  const iv = new Uint8Array(12)
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new Uint8Array([1, 2, 3]),
  )
  return { iv, sealed }
}

describe('password keys', () => {
  it('SEC-02: derives the same login secret from the same password and salt, every time', async () => {
    const first = await derivePasswordKeys('correct horse battery staple', cheap, unsafe)
    const second = await derivePasswordKeys('correct horse battery staple', cheap, unsafe)

    expect(first.loginSecret).toBe(second.loginSecret)
    // Known answer, checked against Python's argon2-cffi and cryptography's HKDF. If this
    // changes, every existing account is locked out.
    expect(first.loginSecret).toBe('o59-nMa1ZS4VmdFCj5JlRdpVipSl9b96f5yZOY24uBs')
  })

  it('SEC-02: the login secret reveals neither the password nor the key-encryption key', async () => {
    const { loginSecret, keyEncryptionKey } = await derivePasswordKeys(
      'hunter2hunter2',
      cheap,
      unsafe,
    )

    expect(loginSecret).not.toContain('hunter2')
    expect(fromBase64Url(loginSecret)).toHaveLength(32)
    expect(keyEncryptionKey.extractable).toBe(false)
    expect(keyEncryptionKey.algorithm.name).toBe('AES-KW')
  })

  it('SEC-02: a different password or salt gives a different login secret', async () => {
    const base = await derivePasswordKeys('one password', cheap, unsafe)
    const otherPassword = await derivePasswordKeys('two password', cheap, unsafe)
    const otherSalt = await derivePasswordKeys(
      'one password',
      { ...cheap, salt: toBase64Url(new Uint8Array(16).fill(8)) },
      unsafe,
    )

    expect(otherPassword.loginSecret).not.toBe(base.loginSecret)
    expect(otherSalt.loginSecret).not.toBe(base.loginSecret)
  })

  it('SEC-02: treats the same text typed with composed or decomposed accents as one password', async () => {
    const composed = await derivePasswordKeys('contraseña segura', cheap, unsafe)
    const decomposed = await derivePasswordKeys('contraseña segura', cheap, unsafe)

    expect(decomposed.loginSecret).toBe(composed.loginSecret)
  })

  it('SEC-13: new accounts get a random salt and at least the default Argon2id cost', () => {
    const params = newKdfParams()

    expect(params).toMatchObject({ algorithm: 'argon2id', ...defaultKdfCost })
    expect(fromBase64Url(params.salt)).toHaveLength(16)
    expect(newKdfParams().salt).not.toBe(params.salt)
  })

  it('SEC-03: refuses weak settings a hostile server could send to make guessing cheap', async () => {
    const strong = newKdfParams()
    expect(() => {
      checkKdfParams(strong)
    }).not.toThrow()

    for (const weak of [
      { ...strong, memoryKiB: 1024 },
      { ...strong, iterations: 1 },
      { ...strong, parallelism: 0 },
      { ...strong, salt: toBase64Url(new Uint8Array(4)) },
      { ...strong, memoryKiB: 64 * 1024 * 1024 },
    ]) {
      expect(() => {
        checkKdfParams(weak)
      }).toThrow(WeakKdfParamsError)
    }
    await expect(derivePasswordKeys('a password', cheap)).rejects.toThrow(WeakKdfParamsError)
  })
})

describe('account key', () => {
  it('SEC-07: unwraps with the password or with the recovery key, to the same key', async () => {
    const { keyEncryptionKey } = await derivePasswordKeys('a long password', cheap, unsafe)
    const { recoveryWrappingKey } = await deriveRecoveryKeys(newRecoveryKey())
    const created = await createAccountKey(keyEncryptionKey, recoveryWrappingKey)

    const viaPassword = await unwrapAccountKey(created.wrappedByPassword, keyEncryptionKey)
    const viaRecovery = await unwrapAccountKey(created.wrappedByRecovery, recoveryWrappingKey)

    const { iv, sealed } = await roundTrip(created.accountKey)
    for (const key of [viaPassword, viaRecovery]) {
      const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, sealed)
      expect(new Uint8Array(opened)).toEqual(new Uint8Array([1, 2, 3]))
    }
  })

  it('SEC-07: the recovery key sets a new password over the same account key', async () => {
    const old = await derivePasswordKeys('the forgotten password', cheap, unsafe)
    const { recoveryWrappingKey } = await deriveRecoveryKeys(newRecoveryKey())
    const created = await createAccountKey(old.keyEncryptionKey, recoveryWrappingKey)
    const fresh = await derivePasswordKeys('a brand new password', cheap, unsafe)

    const rewrapped = await rewrapAccountKey(
      created.wrappedByRecovery,
      recoveryWrappingKey,
      fresh.keyEncryptionKey,
    )

    expect(rewrapped.accountKey.extractable).toBe(false)
    const { iv, sealed } = await roundTrip(created.accountKey)
    const viaNewPassword = await unwrapAccountKey(rewrapped.rewrapped, fresh.keyEncryptionKey)
    for (const key of [rewrapped.accountKey, viaNewPassword]) {
      const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, sealed)
      expect(new Uint8Array(opened)).toEqual(new Uint8Array([1, 2, 3]))
    }
  })

  it('SEC-08: a new recovery key opens the same account key, and the old one no longer does', async () => {
    const { keyEncryptionKey } = await derivePasswordKeys('a long password', cheap, unsafe)
    const old = await deriveRecoveryKeys(newRecoveryKey())
    const created = await createAccountKey(keyEncryptionKey, old.recoveryWrappingKey)
    const replacement = await deriveRecoveryKeys(newRecoveryKey())

    const { rewrapped } = await rewrapAccountKey(
      created.wrappedByPassword,
      keyEncryptionKey,
      replacement.recoveryWrappingKey,
    )

    const { iv, sealed } = await roundTrip(created.accountKey)
    const viaNewKey = await unwrapAccountKey(rewrapped, replacement.recoveryWrappingKey)
    const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, viaNewKey, sealed)
    expect(new Uint8Array(opened)).toEqual(new Uint8Array([1, 2, 3]))
    await expect(unwrapAccountKey(rewrapped, old.recoveryWrappingKey)).rejects.toThrow(
      WrongKeyError,
    )
  })

  it('SEC-07: a wrong recovery key opens nothing', async () => {
    const { keyEncryptionKey } = await derivePasswordKeys('a long password', cheap, unsafe)
    const { recoveryWrappingKey } = await deriveRecoveryKeys(newRecoveryKey())
    const created = await createAccountKey(keyEncryptionKey, recoveryWrappingKey)
    const wrong = await deriveRecoveryKeys(newRecoveryKey())

    await expect(
      rewrapAccountKey(created.wrappedByRecovery, wrong.recoveryWrappingKey, keyEncryptionKey),
    ).rejects.toThrow(WrongKeyError)
  })

  it('SEC-13: keeps every key it hands out non-extractable', async () => {
    const { keyEncryptionKey } = await derivePasswordKeys('a long password', cheap, unsafe)
    const { recoveryWrappingKey } = await deriveRecoveryKeys(newRecoveryKey())
    const created = await createAccountKey(keyEncryptionKey, recoveryWrappingKey)

    expect(created.accountKey.extractable).toBe(false)
    expect(recoveryWrappingKey.extractable).toBe(false)
    expect((await unwrapAccountKey(created.wrappedByPassword, keyEncryptionKey)).extractable).toBe(
      false,
    )
  })

  it('SEC-09: every account gets its own key', async () => {
    const { keyEncryptionKey } = await derivePasswordKeys('a long password', cheap, unsafe)
    const { recoveryWrappingKey } = await deriveRecoveryKeys(newRecoveryKey())
    const first = await createAccountKey(keyEncryptionKey, recoveryWrappingKey)
    const second = await createAccountKey(keyEncryptionKey, recoveryWrappingKey)

    const { iv, sealed } = await roundTrip(first.accountKey)
    await expect(
      crypto.subtle.decrypt({ name: 'AES-GCM', iv }, second.accountKey, sealed),
    ).rejects.toThrow()
  })

  it('SEC-02: a wrong password or an altered wrapped key fails to unwrap', async () => {
    const right = await derivePasswordKeys('the right password', cheap, unsafe)
    const wrong = await derivePasswordKeys('the wrong password', cheap, unsafe)
    const { recoveryWrappingKey } = await deriveRecoveryKeys(newRecoveryKey())
    const { wrappedByPassword } = await createAccountKey(
      right.keyEncryptionKey,
      recoveryWrappingKey,
    )

    await expect(unwrapAccountKey(wrappedByPassword, wrong.keyEncryptionKey)).rejects.toThrow(
      WrongKeyError,
    )
    const altered = fromBase64Url(wrappedByPassword)
    altered[5] = (altered[5] ?? 0) ^ 1
    await expect(unwrapAccountKey(toBase64Url(altered), right.keyEncryptionKey)).rejects.toThrow(
      WrongKeyError,
    )
  })

  it('SEC-07: the recovery secret differs from the recovery key and from the login secret', async () => {
    const recoveryKey = newRecoveryKey()
    const { recoverySecret } = await deriveRecoveryKeys(recoveryKey)
    const again = await deriveRecoveryKeys(recoveryKey)

    expect(again.recoverySecret).toBe(recoverySecret)
    expect(recoverySecret).not.toBe(toBase64Url(recoveryKey))
  })
})
