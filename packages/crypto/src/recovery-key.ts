import { fromBase32, toBase32 } from './encoding.ts'
import { randomBytes } from './keys.ts'

// SEC-07: the recovery key is 256 random bits shown once at sign-up, written as
// Crockford base32 in groups of four, plus four check characters so a typo is
// reported as a typo rather than as the wrong key.

const keyBytes = 32
const keyChars = 52
const checkChars = 4
const groupSize = 4

export function newRecoveryKey() {
  return randomBytes(keyBytes)
}

export async function formatRecoveryKey(key: Uint8Array): Promise<string> {
  if (key.length !== keyBytes) throw new Error('A recovery key is 32 bytes')
  const text = toBase32(key) + (await checksum(key))
  return text.match(new RegExp(`.{1,${groupSize}}`, 'g'))?.join('-') ?? text
}

export class RecoveryKeyTypoError extends Error {
  constructor() {
    super('The recovery key has a typo')
    this.name = 'RecoveryKeyTypoError'
  }
}

export async function parseRecoveryKey(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const clean = text.toUpperCase().replace(/[\s-]/g, '')
  if (clean.length !== keyChars + checkChars) throw new RecoveryKeyTypoError()
  let key: Uint8Array<ArrayBuffer>
  try {
    key = fromBase32(clean.slice(0, keyChars), keyBytes)
  } catch {
    throw new RecoveryKeyTypoError()
  }
  // Re-encoding catches a wrong last character and mistyped check characters.
  const expected = (await formatRecoveryKey(key)).replaceAll('-', '')
  const typed = clean.replace(/[IL]/g, '1').replace(/O/g, '0')
  if (typed !== expected) throw new RecoveryKeyTypoError()
  return key
}

async function checksum(key: Uint8Array) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(key))
  return toBase32(new Uint8Array(digest)).slice(0, checkChars)
}
