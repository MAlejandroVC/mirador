import { argon2id } from 'hash-wasm'
import { fromBase64Url, toBase64Url, utf8 } from './encoding.ts'

// The key hierarchy (SEC-02, SEC-03, SEC-07; see "Encryption and keys" in the stack doc):
//
//   password --Argon2id--> master --HKDF--> login secret (sent to the server, which hashes it again)
//                                   \-----> key-encryption key (never leaves the browser)
//   recovery key --HKDF--> recovery secret (the server keeps only a hash)
//                   \----> recovery wrapping key
//   passkey PRF output --HKDF--> passkey wrapping key (one per passkey, SYS-06)
//   account key (random) encrypts the data, and the server stores it only wrapped by
//   the key-encryption key, the recovery wrapping key and each passkey's wrapping key.
//
// Every key the browser keeps is a non-extractable WebCrypto key (SEC-13).

const subtle = globalThis.crypto.subtle

export interface KdfParams {
  algorithm: 'argon2id'
  // base64url, 16 random bytes made at sign-up.
  salt: string
  memoryKiB: number
  iterations: number
  parallelism: number
}

// Starting point from the stack doc, at or above OWASP's Argon2id advice. They are
// stored per user, so they can be raised later without locking anyone out.
export const defaultKdfCost = { memoryKiB: 64 * 1024, iterations: 3, parallelism: 1 } as const

// The server hands these back before sign-in. A hostile server could ask for weak
// settings to make guessing the password from the login secret cheap, so the
// browser refuses anything below the default cost.
const minimumKdfCost = defaultKdfCost
const maximumKdfCost = { memoryKiB: 1024 * 1024, iterations: 64, parallelism: 16 } as const
const saltBytes = 16

export class WeakKdfParamsError extends Error {
  constructor() {
    super('The server asked for key derivation settings below the safe minimum')
    this.name = 'WeakKdfParamsError'
  }
}

export function newKdfParams(): KdfParams {
  return {
    algorithm: 'argon2id',
    salt: toBase64Url(randomBytes(saltBytes)),
    ...defaultKdfCost,
  }
}

export function checkKdfParams(params: KdfParams) {
  const salt = fromBase64Url(params.salt)
  const ok =
    salt.length >= saltBytes &&
    params.memoryKiB >= minimumKdfCost.memoryKiB &&
    params.iterations >= minimumKdfCost.iterations &&
    params.parallelism >= minimumKdfCost.parallelism &&
    params.memoryKiB <= maximumKdfCost.memoryKiB &&
    params.iterations <= maximumKdfCost.iterations &&
    params.parallelism <= maximumKdfCost.parallelism
  if (!ok) throw new WeakKdfParamsError()
}

export interface PasswordKeys {
  // Sent to the server as the password; it can't be turned back into the password
  // or into the key-encryption key (SEC-03).
  loginSecret: string
  keyEncryptionKey: CryptoKey
}

export interface DeriveOptions {
  // Tests lower the cost to keep the suite fast. Never used by the app.
  unsafeSkipCostCheck?: boolean
}

// SEC-02: the password and everything derived from it stay in the browser, except
// the login secret.
export async function derivePasswordKeys(
  password: string,
  params: KdfParams,
  { unsafeSkipCostCheck = false }: DeriveOptions = {},
): Promise<PasswordKeys> {
  if (!unsafeSkipCostCheck) checkKdfParams(params)
  const master = await argon2id({
    password: password.normalize('NFC'),
    salt: fromBase64Url(params.salt),
    memorySize: params.memoryKiB,
    iterations: params.iterations,
    parallelism: params.parallelism,
    hashLength: 32,
    outputType: 'binary',
  })
  return splitSecret(master, 'login secret', 'key encryption key')
}

async function splitSecret(secret: Uint8Array, loginLabel: string, wrappingLabel: string) {
  const base = await subtle.importKey('raw', new Uint8Array(secret), 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ])
  const loginSecret = await subtle.deriveBits(hkdf(loginLabel), base, 256)
  const keyEncryptionKey = await subtle.deriveKey(
    hkdf(wrappingLabel),
    base,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
  return { loginSecret: toBase64Url(new Uint8Array(loginSecret)), keyEncryptionKey }
}

function hkdf(label: string): HkdfParams {
  // The master secret is already salted and stretched, so HKDF only separates its
  // uses; the label keeps each output independent of the others.
  return {
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(),
    info: utf8(`mirador ${label} v1`),
  }
}

export interface RecoveryKeys {
  recoverySecret: string
  recoveryWrappingKey: CryptoKey
}

export async function deriveRecoveryKeys(recoveryKey: Uint8Array): Promise<RecoveryKeys> {
  // 256 random bits need no stretching, unlike a password.
  const { loginSecret, keyEncryptionKey } = await splitSecret(
    recoveryKey,
    'recovery secret',
    'recovery wrapping key',
  )
  return { recoverySecret: loginSecret, recoveryWrappingKey: keyEncryptionKey }
}

// SYS-06, SEC-12: a passkey that supports the WebAuthn PRF extension returns 32 secret
// bytes that only that passkey can produce, after Face ID, a fingerprint or the
// device's PIN. They wrap the account key like a password does, so the passkey can
// unlock the data without the password; the server stores only the wrapped key.
export async function derivePasskeyKey(prfOutput: Uint8Array): Promise<CryptoKey> {
  if (prfOutput.length < 32) throw new WrongKeyError()
  const base = await subtle.importKey('raw', new Uint8Array(prfOutput), 'HKDF', false, [
    'deriveKey',
  ])
  return subtle.deriveKey(
    hkdf('passkey wrapping key'),
    base,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

const accountKeyAlgorithm = { name: 'AES-GCM', length: 256 } as const
const accountKeyUsages: KeyUsage[] = ['encrypt', 'decrypt']

export interface NewAccountKey {
  // Usable only to encrypt and decrypt; this is the one the app keeps.
  accountKey: CryptoKey
  wrappedByPassword: string
  wrappedByRecovery: string
}

// SEC-01, SEC-09: each account gets its own random data key. WebCrypto can only wrap
// an extractable key, so the extractable copy lives only inside this function.
export async function createAccountKey(
  keyEncryptionKey: CryptoKey,
  recoveryWrappingKey: CryptoKey,
): Promise<NewAccountKey> {
  const extractable = await subtle.generateKey(accountKeyAlgorithm, true, accountKeyUsages)
  const [wrappedByPassword, wrappedByRecovery] = await Promise.all([
    wrap(extractable, keyEncryptionKey),
    wrap(extractable, recoveryWrappingKey),
  ])
  const accountKey = await unwrapAccountKey(wrappedByPassword, keyEncryptionKey)
  return { accountKey, wrappedByPassword, wrappedByRecovery }
}

// SEC-07, SEC-08, SYS-06: wraps the account key under a new key. A forgotten password opens it
// with the recovery wrapping key and wraps it for the new password; changing the
// password or the recovery key opens it with the current password's key and wraps it
// for the new one. Like createAccountKey, the extractable copy WebCrypto needs for
// wrapping exists only inside this function. A wrong key or an altered wrapped key
// fails here (WrongKeyError).
export async function rewrapAccountKey(
  wrapped: string,
  unwrappingKey: CryptoKey,
  newWrappingKey: CryptoKey,
): Promise<{ accountKey: CryptoKey; rewrapped: string }> {
  let extractable: CryptoKey
  try {
    extractable = await subtle.unwrapKey(
      'raw',
      fromBase64Url(wrapped),
      unwrappingKey,
      'AES-KW',
      accountKeyAlgorithm,
      true,
      accountKeyUsages,
    )
  } catch {
    throw new WrongKeyError()
  }
  const rewrapped = await wrap(extractable, newWrappingKey)
  const accountKey = await unwrapAccountKey(rewrapped, newWrappingKey)
  return { accountKey, rewrapped }
}

async function wrap(key: CryptoKey, wrappingKey: CryptoKey) {
  return toBase64Url(new Uint8Array(await subtle.wrapKey('raw', key, wrappingKey, 'AES-KW')))
}

export class WrongKeyError extends Error {
  constructor() {
    super('The key could not be unwrapped: wrong password or recovery key, or altered data')
    this.name = 'WrongKeyError'
  }
}

// AES-KW checks integrity, so a wrong password or a key altered on the server fails
// here instead of producing garbage.
export async function unwrapAccountKey(wrapped: string, wrappingKey: CryptoKey) {
  try {
    return await subtle.unwrapKey(
      'raw',
      fromBase64Url(wrapped),
      wrappingKey,
      'AES-KW',
      accountKeyAlgorithm,
      false,
      accountKeyUsages,
    )
  } catch {
    throw new WrongKeyError()
  }
}

export function randomBytes(length: number) {
  return globalThis.crypto.getRandomValues(new Uint8Array(length))
}
