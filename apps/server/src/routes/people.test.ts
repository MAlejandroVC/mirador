import { peopleResponse, sessionResponse } from '@repo/api'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  base64Url,
  cookieOf,
  createTestApp,
  del,
  get,
  newAccount,
  post,
  signUp,
  testSetupCode,
  type TestServer,
} from '../test-app.ts'
import { deleteRemovedAccounts } from './people.ts'

const day = 24 * 60 * 60 * 1000
const sealed = (seed: string) => `v1.${base64Url(64, seed)}`
const recordId = '0192f1c4-0000-7000-8000-000000000001'

async function people(server: TestServer, cookie: string) {
  return peopleResponse.parse(await (await get(server, '/api/people', cookie)).json()).people
}

async function sessionOf(server: TestServer, cookie: string) {
  return sessionResponse.parse(await (await get(server, '/api/session', cookie)).json())
}

describe('removing people', () => {
  let server: TestServer
  let operator: string
  let ben: string
  let benId: string

  beforeEach(async () => {
    server = await createTestApp()
    operator = await signUp(server, newAccount('ana', { setupCode: testSetupCode }))
    const made = await post(
      server,
      '/api/invites',
      { expiresAt: new Date(Date.now() + 7 * day).toISOString(), maxUses: null },
      { Cookie: operator },
    )
    const { code } = (await made.json()) as { code: string }
    ben = await signUp(server, newAccount('ben', { inviteCode: code }))
    benId = (await sessionOf(server, ben))?.user.id ?? ''
    const saved = await post(
      server,
      '/api/records',
      { changes: [{ id: recordId, baseRevision: 0, ciphertext: sealed('ben') }] },
      { Cookie: ben },
    )
    expect(saved.status).toBe(200)
  })

  const remove = (id: string, cookie = operator) =>
    post(server, `/api/people/${id}/remove`, {}, { Cookie: cookie })

  it('SYS-22: the operator sees everyone on the server and can remove them', async () => {
    const listed = await people(server, operator)
    expect(listed.map((person) => [person.username, person.operator, person.deletesAt])).toEqual([
      ['ana', true, null],
      ['ben', false, null],
    ])

    expect((await remove(benId)).status).toBe(204)

    const [, removed] = await people(server, operator)
    const deletesIn = Date.parse(removed?.deletesAt ?? '') - Date.now()
    expect(deletesIn).toBeGreaterThan(29 * day)
    expect(deletesIn).toBeLessThanOrEqual(30 * day)
  })

  it('SYS-22: only the operator lists or removes people, and never themselves', async () => {
    const anaId = (await sessionOf(server, operator))?.user.id ?? ''

    expect((await get(server, '/api/people', ben)).status).toBe(403)
    expect((await get(server, '/api/people')).status).toBe(401)
    expect((await remove(anaId, ben)).status).toBe(403)
    expect((await post(server, `/api/people/${benId}/restore`, {}, { Cookie: ben })).status).toBe(
      403,
    )
    expect((await remove(anaId)).status).toBe(403)
    expect((await remove('no-such-person')).status).toBe(404)
    expect((await sessionOf(server, operator))?.user.removed).toBeNull()
  })

  it('SYS-23: a removed account can unlock and download its data, and nothing else', async () => {
    await remove(benId)

    // Still signed in, and told until when the data can be downloaded.
    const session = await sessionOf(server, ben)
    expect(session?.user.removed?.deletesAt).toBeTruthy()
    expect((await get(server, '/api/keys', ben)).status).toBe(200)
    const pulled = await get(server, '/api/records?after=0', ben)
    expect(pulled.status).toBe(200)
    expect(JSON.stringify(await pulled.json())).toContain(sealed('ben'))

    // Everything that changes data or the account is refused.
    const refused = [
      await post(
        server,
        '/api/records',
        { changes: [{ id: recordId, baseRevision: 1, ciphertext: sealed('new') }] },
        { Cookie: ben },
      ),
      await post(
        server,
        '/api/accounts/username',
        { username: 'benito', loginSecret: newAccount('ben').loginSecret },
        { Cookie: ben },
      ),
      await post(server, '/api/accounts/password', {}, { Cookie: ben }),
      await post(server, '/api/accounts/recovery-key', {}, { Cookie: ben }),
      await del(server, '/api/session/others', ben),
      await get(server, '/api/passkeys', ben),
      await post(server, '/api/passkeys/registration', {}, { Cookie: ben }),
    ]
    for (const response of refused) {
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'removed' })
    }
    const [row] = (
      await server.db.execute(sql`select ciphertext from records where id = ${recordId}`)
    ).rows
    expect(row).toEqual({ ciphertext: sealed('ben') })
  })

  it('SYS-23: a removed account can still sign in again to download its data', async () => {
    await remove(benId)
    await del(server, '/api/session', ben)

    const account = newAccount('ben')
    const signedIn = await post(server, '/api/session', {
      username: 'ben',
      loginSecret: account.loginSecret,
    })
    expect(signedIn.status).toBe(204)
    const cookie = cookieOf(signedIn)
    expect((await sessionOf(server, cookie))?.user.removed).not.toBeNull()
    expect((await get(server, '/api/records?after=0', cookie)).status).toBe(200)
    expect(
      (
        await post(
          server,
          '/api/records',
          { changes: [{ id: recordId, baseRevision: 1, ciphertext: sealed('new') }] },
          { Cookie: cookie },
        )
      ).status,
    ).toBe(403)
  })

  it('SYS-22: the operator can restore a removed account before it is deleted', async () => {
    await remove(benId)

    expect(
      (await post(server, `/api/people/${benId}/restore`, {}, { Cookie: operator })).status,
    ).toBe(204)

    expect((await sessionOf(server, ben))?.user.removed).toBeNull()
    const saved = await post(
      server,
      '/api/records',
      { changes: [{ id: recordId, baseRevision: 1, ciphertext: sealed('new') }] },
      { Cookie: ben },
    )
    expect(saved.status).toBe(200)
  })

  it('SYS-23: after 30 days the account and all its data are deleted', async () => {
    await remove(benId)
    await server.db.execute(
      sql`update users set removed_at = now() - interval '30 days 1 minute' where id = ${benId}`,
    )

    // Signed out at once, before the clean-up runs.
    expect(await sessionOf(server, ben)).toBeNull()
    expect((await get(server, '/api/records?after=0', ben)).status).toBe(401)
    expect(
      (await post(server, `/api/people/${benId}/restore`, {}, { Cookie: operator })).status,
    ).toBe(404)

    expect(await deleteRemovedAccounts(server.db)).toEqual({ deleted: 1, remaining: 1 })
    for (const table of ['users', 'sessions', 'key_material', 'records']) {
      const rows = await server.db.execute(
        sql.raw(
          `select count(*)::int as n from ${table} where ${table === 'users' ? 'id' : 'user_id'} = '${benId}'`,
        ),
      )
      expect(rows.rows).toEqual([{ n: 0 }])
    }
    expect((await people(server, operator)).map((person) => person.username)).toEqual(['ana'])
  })

  it('SYS-23: the clean-up leaves removed accounts still in their window alone', async () => {
    await remove(benId)
    await server.db.execute(
      sql`update users set removed_at = now() - interval '29 days' where id = ${benId}`,
    )

    expect(await deleteRemovedAccounts(server.db)).toEqual({ deleted: 0, remaining: 2 })
    expect((await sessionOf(server, ben))?.user.username).toBe('ben')
  })

  it('SYS-23: a removed account can delete itself early', async () => {
    await remove(benId)

    const deleted = await post(
      server,
      '/api/accounts/delete',
      { loginSecret: newAccount('ben').loginSecret, username: 'ben' },
      { Cookie: ben },
    )

    expect(deleted.status).toBe(204)
    expect((await people(server, operator)).map((person) => person.username)).toEqual(['ana'])
  })
})
