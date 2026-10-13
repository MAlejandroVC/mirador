import type { PushRequest } from '@repo/api'
import {
  createAccountKey,
  derivePasswordKeys,
  deriveRecoveryKeys,
  newKdfParams,
  newRecordId,
  randomBytes,
} from '@repo/crypto'
import { describe, expect, it } from 'vitest'
import { RecordsAltered, RecordSync, type SyncTransport } from './index.ts'

// A real account key, made the way sign-up makes one but with a cheap Argon2id.
async function accountKey() {
  const kdf = { ...newKdfParams(), memoryKiB: 8, iterations: 1 }
  const { keyEncryptionKey } = await derivePasswordKeys('password', kdf, {
    unsafeSkipCostCheck: true,
  })
  const { recoveryWrappingKey } = await deriveRecoveryKeys(randomBytes(32))
  return (await createAccountKey(keyEncryptionKey, recoveryWrappingKey)).accountKey
}

// Behaves like apps/server/src/routes/records.ts for one user, and keeps everything it
// was sent so the tests can check what left the device.
function fakeServer() {
  const rows = new Map<string, { revision: number; ciphertext: string }>()
  let last = 0
  const sent: string[] = []
  const transport: SyncTransport = {
    pull(after) {
      const changes = [...rows]
        .map(([id, row]) => ({ id, ...row }))
        .filter((row) => row.revision > after)
        .sort((a, b) => a.revision - b.revision)
      return Promise.resolve({ changes: changes.slice(0, 2), more: changes.length > 2 })
    },
    push(changes: PushRequest['changes']) {
      sent.push(JSON.stringify(changes))
      const conflicts = changes
        .filter((change) => change.baseRevision !== (rows.get(change.id)?.revision ?? 0))
        .map((change) => change.id)
      if (conflicts.length > 0) return Promise.resolve({ conflicts })
      const revisions: Record<string, number> = {}
      for (const change of changes) {
        last += 1
        rows.set(change.id, { revision: last, ciphertext: change.ciphertext })
        revisions[change.id] = last
      }
      return Promise.resolve({ revisions })
    },
  }
  return { transport, rows, sent }
}

const note = (text: string) => ({
  deleted: false as const,
  type: 'note',
  schema: 1,
  data: { text },
})

describe('RecordSync', () => {
  it('SEC-01: what leaves the device is ciphertext only', async () => {
    const server = fakeServer()
    const phone = new RecordSync(server.transport, await accountKey(), 'user-ana')

    await phone.save([{ id: newRecordId(), body: note('Rent 12500 MXN to Casa Azul') }])

    const everything = server.sent.join('\n') + JSON.stringify([...server.rows])
    expect(everything).not.toMatch(/Rent|12500|Casa Azul|note/)
  })

  it('NFR-05: another device of the same user gets every change, across pages', async () => {
    const server = fakeServer()
    const key = await accountKey()
    const phone = new RecordSync(server.transport, key, 'user-ana')
    const laptop = new RecordSync(server.transport, key, 'user-ana')
    const ids = [newRecordId(), newRecordId(), newRecordId()]

    await phone.save(ids.map((id, index) => ({ id, body: note(`note ${index}`) })))
    expect((await laptop.pull()).sort()).toEqual([...ids].sort())
    expect(laptop.get(ids[2]!)?.body).toEqual(note('note 2'))

    await phone.save([{ id: ids[0]!, body: { deleted: true, type: 'note' } }])
    expect(await laptop.pull()).toEqual([ids[0]])
    expect(laptop.get(ids[0]!)?.body).toEqual({ deleted: true, type: 'note' })
    expect(await laptop.pull()).toEqual([])
  })

  it('NFR-05: when two devices edit one record, the later save wins and says what it replaced', async () => {
    const server = fakeServer()
    const key = await accountKey()
    const phone = new RecordSync(server.transport, key, 'user-ana')
    const laptop = new RecordSync(server.transport, key, 'user-ana')
    const id = newRecordId()
    await phone.save([{ id, body: note('first') }])
    await laptop.pull()

    await phone.save([{ id, body: note('from the phone') }])
    const overwritten = await laptop.save([{ id, body: note('from the laptop') }])

    expect(overwritten).toEqual([{ id, body: note('from the phone') }])
    await phone.pull()
    expect(phone.get(id)?.body).toEqual(note('from the laptop'))
  })

  it('SEC-04: stops when the server hands back an altered or swapped record', async () => {
    const server = fakeServer()
    const key = await accountKey()
    const phone = new RecordSync(server.transport, key, 'user-ana')
    const [first, second] = [newRecordId(), newRecordId()]
    await phone.save([
      { id: first, body: note('a') },
      { id: second, body: note('b') },
    ])
    // The server swaps the two ciphertexts.
    const a = server.rows.get(first)!
    const b = server.rows.get(second)!
    server.rows.set(first, { ...a, ciphertext: b.ciphertext })
    server.rows.set(second, { ...b, ciphertext: a.ciphertext })

    await expect(new RecordSync(server.transport, key, 'user-ana').pull()).rejects.toBeInstanceOf(
      RecordsAltered,
    )
  })

  it('SEC-09: another user, even with the ciphertext in hand, reads nothing', async () => {
    const server = fakeServer()
    await new RecordSync(server.transport, await accountKey(), 'user-ana').save([
      { id: newRecordId(), body: note('mine') },
    ])

    await expect(
      new RecordSync(server.transport, await accountKey(), 'user-ben').pull(),
    ).rejects.toBeInstanceOf(RecordsAltered)
  })
})
