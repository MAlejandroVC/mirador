import { maxPullChanges, pullResponse, pushConflict, pushResponse } from '@repo/api'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  base64Url,
  createTestApp,
  get,
  newAccount,
  post,
  signUp,
  testSetupCode,
  type TestServer,
} from '../test-app.ts'

// The server can't tell real ciphertext from these, which is the point; real records
// are encrypted in the browser (see @repo/crypto and @repo/sync).
const sealed = (seed: string) => `v1.${base64Url(64, seed)}`

let sequence = 0
function newId() {
  sequence += 1
  return `0192f1c4-0000-7000-8000-${sequence.toString().padStart(12, '0')}`
}

function push(
  server: TestServer,
  cookie: string,
  changes: { id: string; baseRevision: number; ciphertext: string }[],
) {
  return post(server, '/api/records', { changes }, { Cookie: cookie })
}

async function pull(server: TestServer, cookie: string, after = 0) {
  const response = await get(server, `/api/records?after=${after}`, cookie)
  expect(response.status).toBe(200)
  return pullResponse.parse(await response.json())
}

describe('records', () => {
  let server: TestServer
  let ana: string
  let ben: string

  beforeEach(async () => {
    server = await createTestApp({ openSignUp: true })
    ana = await signUp(server, newAccount('ana', { setupCode: testSetupCode }))
    ben = await signUp(server, newAccount('ben'))
  })

  it('SEC-01: stores ciphertext and hands back every change after a revision', async () => {
    const [first, second] = [newId(), newId()]
    const response = await push(server, ana, [
      { id: first, baseRevision: 0, ciphertext: sealed('a') },
      { id: second, baseRevision: 0, ciphertext: sealed('b') },
    ])
    expect(response.status).toBe(200)
    expect(pushResponse.parse(await response.json()).revisions).toEqual({
      [first]: 1,
      [second]: 2,
    })

    expect((await pull(server, ana)).changes).toEqual([
      { id: first, revision: 1, ciphertext: sealed('a') },
      { id: second, revision: 2, ciphertext: sealed('b') },
    ])
    expect((await pull(server, ana, 1)).changes.map((change) => change.id)).toEqual([second])
    expect((await pull(server, ana, 2)).changes).toEqual([])
  })

  it('NFR-05: an edit based on the latest revision replaces the record for every device', async () => {
    const id = newId()
    await push(server, ana, [{ id, baseRevision: 0, ciphertext: sealed('a') }])

    const edit = await push(server, ana, [{ id, baseRevision: 1, ciphertext: sealed('a2') }])

    expect(pushResponse.parse(await edit.json()).revisions).toEqual({ [id]: 2 })
    expect((await pull(server, ana)).changes).toEqual([
      { id, revision: 2, ciphertext: sealed('a2') },
    ])
  })

  it('NFR-08: refuses a whole batch when another device changed one of its records', async () => {
    const [kept, other] = [newId(), newId()]
    await push(server, ana, [{ id: kept, baseRevision: 0, ciphertext: sealed('phone') }])

    const stale = await push(server, ana, [
      { id: other, baseRevision: 0, ciphertext: sealed('new') },
      { id: kept, baseRevision: 0, ciphertext: sealed('laptop') },
    ])

    expect(stale.status).toBe(409)
    expect(pushConflict.parse(await stale.json()).conflicts).toEqual([kept])
    expect((await pull(server, ana)).changes).toEqual([
      { id: kept, revision: 1, ciphertext: sealed('phone') },
    ])
  })

  it('WID-10: a retried upload is saved once', async () => {
    const id = newId()
    const change = { id, baseRevision: 0, ciphertext: sealed('a') }
    await push(server, ana, [change])

    const retry = await push(server, ana, [change])

    expect(retry.status).toBe(200)
    expect(pushResponse.parse(await retry.json()).revisions).toEqual({ [id]: 1 })
    expect((await pull(server, ana)).changes).toHaveLength(1)
  })

  it('SEC-09: each user sees and changes only their own records', async () => {
    const id = newId()
    await push(server, ana, [{ id, baseRevision: 0, ciphertext: sealed('ana') }])

    expect((await pull(server, ben)).changes).toEqual([])
    // The same id from Ben is his own record; Ana's is untouched.
    expect(
      (await push(server, ben, [{ id, baseRevision: 0, ciphertext: sealed('ben') }])).status,
    ).toBe(200)
    expect((await pull(server, ana)).changes).toEqual([
      { id, revision: 1, ciphertext: sealed('ana') },
    ])
    expect((await pull(server, ben)).changes).toEqual([
      { id, revision: 1, ciphertext: sealed('ben') },
    ])
  })

  it('SEC-09: refuses anyone signed out', async () => {
    expect((await get(server, '/api/records')).status).toBe(401)
    expect(
      (
        await post(server, '/api/records', {
          changes: [{ id: newId(), baseRevision: 0, ciphertext: sealed('x') }],
        })
      ).status,
    ).toBe(401)
  })

  it('refuses malformed batches: duplicates, bad ids, plaintext and huge batches', async () => {
    const id = newId()
    for (const changes of [
      [
        { id, baseRevision: 0, ciphertext: sealed('a') },
        { id, baseRevision: 0, ciphertext: sealed('b') },
      ],
      [{ id: 'not-a-uuid', baseRevision: 0, ciphertext: sealed('a') }],
      [{ id: newId(), baseRevision: 0, ciphertext: '{"amount": 12500}' }],
      Array.from({ length: 501 }, () => ({
        id: newId(),
        baseRevision: 0,
        ciphertext: sealed('a'),
      })),
    ]) {
      expect((await push(server, ana, changes)).status).toBe(400)
    }
  })

  it('NFR-05: hands out changes in pages', async () => {
    const changes = Array.from({ length: maxPullChanges }, () => ({
      id: newId(),
      baseRevision: 0,
      ciphertext: sealed('x'),
    }))
    await push(server, ana, changes)
    await push(server, ana, [{ id: newId(), baseRevision: 0, ciphertext: sealed('y') }])

    const first = await pull(server, ana)
    expect(first.changes).toHaveLength(maxPullChanges)
    expect(first.more).toBe(true)
    const rest = await pull(server, ana, first.changes.at(-1)!.revision)
    expect(rest.changes).toHaveLength(1)
    expect(rest.more).toBe(false)
  })
})
