import { describe, expect, it } from 'vitest'
import { createAccountKey, deriveRecoveryKeys, randomBytes } from './keys.ts'
import { decryptRecord, encryptRecord, newRecordId, TamperedRecordError } from './records.ts'

async function accountKey() {
  const wrapping = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
  const { recoveryWrappingKey } = await deriveRecoveryKeys(randomBytes(32))
  return (await createAccountKey(wrapping, recoveryWrappingKey)).accountKey
}

const ana = { userId: 'user-ana', recordId: '0192f1c4-0000-7000-8000-000000000001' }
const body = { type: 'note', schema: 1, deleted: false, data: { text: 'rent 12500 MXN' } }

describe('records', () => {
  it('SEC-01: a record round-trips, and its ciphertext shows nothing of it', async () => {
    const key = await accountKey()
    const sealed = await encryptRecord(key, ana, body)

    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+$/)
    expect(sealed).not.toContain('rent')
    expect(await decryptRecord(key, ana, sealed)).toEqual(body)
    expect(await encryptRecord(key, ana, body)).not.toBe(sealed)
  })

  it('SEC-04: refuses a record moved to another id or user, or altered', async () => {
    const key = await accountKey()
    const sealed = await encryptRecord(key, ana, body)
    // Change the second-to-last character: the last one can hold only padding bits. Compare
    // that same character, or 1 time in 64 the "change" writes back the letter already there.
    const at = sealed.length - 2
    const flipped = sealed.slice(0, at) + (sealed[at] === 'A' ? 'B' : 'A') + sealed.slice(at + 1)

    for (const attempt of [
      () => decryptRecord(key, { ...ana, recordId: newRecordId() }, sealed),
      () => decryptRecord(key, { ...ana, userId: 'user-ben' }, sealed),
      () => decryptRecord(key, ana, flipped),
      () => decryptRecord(key, ana, 'v2.' + sealed.slice(3)),
    ]) {
      await expect(attempt()).rejects.toBeInstanceOf(TamperedRecordError)
    }
  })

  it('SEC-09: another account key cannot read the record', async () => {
    const sealed = await encryptRecord(await accountKey(), ana, body)

    await expect(decryptRecord(await accountKey(), ana, sealed)).rejects.toBeInstanceOf(
      TamperedRecordError,
    )
  })

  it('WID-10: record ids are UUIDv7, unique and ordered by time', () => {
    const first = newRecordId(1_700_000_000_000)
    const later = newRecordId(1_700_000_000_001)

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newRecordId(1_700_000_000_000)).not.toBe(first)
    expect(later > first).toBe(true)
  })
})

describe('file fingerprint', () => {
  it('IMP-36: the same bytes give the same SHA-256, other bytes another', async () => {
    const { fileFingerprint } = await import('./fingerprint.ts')
    const a = await fileFingerprint(new TextEncoder().encode('Date;Amount\n2026-10-01;-85'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await fileFingerprint(new TextEncoder().encode('Date;Amount\n2026-10-01;-85'))).toBe(a)
    expect(await fileFingerprint(new TextEncoder().encode('Date;Amount\n2026-10-01;-86'))).not.toBe(
      a,
    )
    expect(await fileFingerprint(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
