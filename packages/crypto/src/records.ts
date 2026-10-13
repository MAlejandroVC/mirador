import { fromBase64Url, toBase64Url, utf8 } from './encoding.ts'
import { randomBytes } from './keys.ts'

// SEC-01: every record leaves the browser as AES-256-GCM ciphertext under the account
// key. The associated data ties each ciphertext to its user and record id, so the
// server can't move one user's record into another account or swap two records:
// either fails to decrypt instead of showing the wrong data (SEC-04).

const subtle = globalThis.crypto.subtle
const nonceBytes = 12
// Bumped only if this envelope itself changes; record shapes are versioned inside it.
const envelopeVersion = 'v1'

export interface RecordAddress {
  userId: string
  recordId: string
}

export class TamperedRecordError extends Error {
  constructor() {
    super('A record could not be decrypted: wrong key, or altered on the server')
    this.name = 'TamperedRecordError'
  }
}

function associatedData({ userId, recordId }: RecordAddress) {
  return utf8(`mirador record ${envelopeVersion}\u0000${userId}\u0000${recordId}`)
}

export async function encryptRecord(accountKey: CryptoKey, address: RecordAddress, body: unknown) {
  const nonce = randomBytes(nonceBytes)
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: associatedData(address) },
    accountKey,
    utf8(JSON.stringify(body)),
  )
  const sealed = new Uint8Array(nonceBytes + ciphertext.byteLength)
  sealed.set(nonce)
  sealed.set(new Uint8Array(ciphertext), nonceBytes)
  return `${envelopeVersion}.${toBase64Url(sealed)}`
}

export async function decryptRecord(
  accountKey: CryptoKey,
  address: RecordAddress,
  envelope: string,
): Promise<unknown> {
  const [version, payload] = envelope.split('.')
  if (version !== envelopeVersion || !payload) throw new TamperedRecordError()
  try {
    const sealed = fromBase64Url(payload)
    const plaintext = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: sealed.subarray(0, nonceBytes),
        additionalData: associatedData(address),
      },
      accountKey,
      sealed.subarray(nonceBytes),
    )
    return JSON.parse(new TextDecoder().decode(plaintext)) as unknown
  } catch {
    throw new TamperedRecordError()
  }
}

// A UUIDv7: made on the device, so a retried upload can't create a duplicate (WID-10),
// and ordered by time, which keeps the server's index compact.
export function newRecordId(now = Date.now()) {
  const bytes = randomBytes(16)
  const time = BigInt(now)
  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Number((time >> BigInt(8 * (5 - index))) & 0xffn)
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
