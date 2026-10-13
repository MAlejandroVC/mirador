import { describe, expect, it } from 'vitest'
import { fromBase32, toBase32 } from './encoding.ts'
import {
  formatRecoveryKey,
  newRecoveryKey,
  parseRecoveryKey,
  RecoveryKeyTypoError,
} from './recovery-key.ts'

describe('recovery key', () => {
  it('SEC-07: is 256 random bits, different every time', () => {
    const key = newRecoveryKey()

    expect(key).toHaveLength(32)
    expect(newRecoveryKey()).not.toEqual(key)
  })

  it('SEC-07: is written as 14 groups of 4 characters that are easy to copy by hand', async () => {
    const text = await formatRecoveryKey(newRecoveryKey())

    expect(text).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){13}[0-9A-HJKMNP-TV-Z]{4}$/)
  })

  it('SEC-07: reads back what was shown, however it is typed', async () => {
    const key = newRecoveryKey()
    const text = await formatRecoveryKey(key)

    expect(await parseRecoveryKey(text)).toEqual(key)
    expect(await parseRecoveryKey(text.toLowerCase())).toEqual(key)
    expect(await parseRecoveryKey(text.replaceAll('-', ' '))).toEqual(key)
    expect(await parseRecoveryKey(` ${text.replaceAll('-', '')}\n`)).toEqual(key)
    expect(await parseRecoveryKey(text.replaceAll('0', 'O').replaceAll('1', 'l'))).toEqual(key)
  })

  it('SEC-07: reports a typo instead of trying a wrong key', async () => {
    const text = await formatRecoveryKey(newRecoveryKey())
    const last = text.at(-1) === 'A' ? 'B' : 'A'

    await expect(parseRecoveryKey(text.slice(0, -1) + last)).rejects.toThrow(RecoveryKeyTypoError)
    await expect(parseRecoveryKey(text.slice(1))).rejects.toThrow(RecoveryKeyTypoError)
    await expect(parseRecoveryKey(`${text}A`)).rejects.toThrow(RecoveryKeyTypoError)
    await expect(parseRecoveryKey(text.replace(/^./, 'U'))).rejects.toThrow(RecoveryKeyTypoError)
    for (let index = 0; index < 52; index += 7) {
      const plain = text.replaceAll('-', '')
      const swapped = plain[index] === '2' ? '3' : '2'
      const typo = plain.slice(0, index) + swapped + plain.slice(index + 1)
      await expect(parseRecoveryKey(typo)).rejects.toThrow(RecoveryKeyTypoError)
    }
  })
})

describe('base32', () => {
  it('SEC-07: round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 128])

    expect(fromBase32(toBase32(bytes), bytes.length)).toEqual(bytes)
    expect(toBase32(new Uint8Array([0xff]))).toBe('ZW')
  })
})
