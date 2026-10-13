import { invitesResponse, newInviteResponse, sessionResponse, signUpError } from '@repo/api'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createTestApp,
  del,
  get,
  newAccount,
  post,
  signUp,
  testSetupCode,
  type TestServer,
} from '../test-app.ts'

async function invite(server: TestServer, cookie: string) {
  const response = await post(server, '/api/invites', {}, { Cookie: cookie })
  expect(response.status).toBe(201)
  return newInviteResponse.parse(await response.json())
}

async function listInvites(server: TestServer, cookie: string) {
  return invitesResponse.parse(await (await get(server, '/api/invites', cookie)).json()).invites
}

async function sessionOf(server: TestServer, cookie: string) {
  return sessionResponse.parse(await (await get(server, '/api/session', cookie)).json())
}

describe('invites', () => {
  let server: TestServer
  let operator: string

  beforeEach(async () => {
    server = await createTestApp()
    operator = await signUp(server, newAccount('ana', { setupCode: testSetupCode }))
  })

  it('SYS-13: whoever creates the first account runs the server', async () => {
    const { invite: first, code } = await invite(server, operator)
    const ben = await signUp(server, newAccount('ben', { inviteCode: code }))

    expect((await sessionOf(server, operator))?.user.operator).toBe(true)
    expect((await sessionOf(server, ben))?.user.operator).toBe(false)
    expect(first.usedAt).toBeNull()
  })

  it('SYS-13: an invite signs up one person, once, and is marked used', async () => {
    const { invite: made, code } = await invite(server, operator)

    // Typed by hand: lower case, spaces for dashes.
    await signUp(server, newAccount('ben', { inviteCode: code.toLowerCase().replaceAll('-', ' ') }))
    const again = await post(server, '/api/accounts', newAccount('cleo', { inviteCode: code }))

    expect(again.status).toBe(403)
    expect(signUpError.parse(await again.json()).error).toBe('wrong-invite')
    const [listed] = await listInvites(server, operator)
    expect(listed).toMatchObject({ id: made.id, usedBy: 'ben' })
    expect(listed?.usedAt).not.toBeNull()
  })

  it('SYS-13: a wrong, withdrawn or expired invite creates nothing', async () => {
    const { invite: withdrawn, code: withdrawnCode } = await invite(server, operator)
    const { code: expiredCode } = await invite(server, operator)
    expect((await del(server, `/api/invites/${withdrawn.id}`, operator)).status).toBe(204)
    await server.db.execute(sql`update invites set expires_at = now() - interval '1 minute'`)

    for (const inviteCode of ['NOTA-REAL-INVI-TECO-DE00', withdrawnCode, expiredCode, undefined]) {
      const response = await post(
        server,
        '/api/accounts',
        newAccount('ben', inviteCode ? { inviteCode } : {}),
      )
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'wrong-invite' })
    }
    const users = await server.db.execute(sql`select username from users`)
    expect(users.rows).toEqual([{ username: 'ana' }])
  })

  it('SYS-06: on an invite-only server, only a waiting invite can check a username', async () => {
    const { code } = await invite(server, operator)
    const { code: withdrawnCode, invite: withdrawn } = await invite(server, operator)
    expect((await del(server, `/api/invites/${withdrawn.id}`, operator)).status).toBe(204)
    const check = (username: string, inviteCode?: string) =>
      post(server, '/api/accounts/username-check', {
        username,
        ...(inviteCode ? { inviteCode } : {}),
      })

    // Otherwise anyone could find out who has an account here.
    for (const inviteCode of [undefined, 'NOTA-REAL-INVI-TECO-DE00', withdrawnCode]) {
      const refused = await check('ana', inviteCode)
      expect(refused.status).toBe(403)
      expect(await refused.json()).toEqual({ error: 'wrong-invite' })
    }
    expect(await (await check('ana', code)).json()).toEqual({ available: false })
    expect(await (await check('ben', code.toLowerCase())).json()).toEqual({ available: true })

    await signUp(server, newAccount('ben', { inviteCode: code }))
    expect((await check('cleo', code)).status).toBe(403)
  })

  it('SYS-13: a username already taken leaves the invite unused', async () => {
    const { code } = await invite(server, operator)

    const taken = await post(server, '/api/accounts', newAccount('ana', { inviteCode: code }))

    expect(taken.status).toBe(409)
    await signUp(server, newAccount('ben', { inviteCode: code }))
  })

  it('SYS-13: only the operator makes, lists and withdraws invites', async () => {
    const { invite: made, code } = await invite(server, operator)
    const ben = await signUp(server, newAccount('ben', { inviteCode: code }))
    const { invite: open } = await invite(server, operator)

    expect((await post(server, '/api/invites', {}, { Cookie: ben })).status).toBe(403)
    expect((await get(server, '/api/invites', ben)).status).toBe(403)
    expect((await del(server, `/api/invites/${open.id}`, ben)).status).toBe(403)
    expect((await get(server, '/api/invites')).status).toBe(401)
    // A used invite stays as a record of who joined.
    expect((await del(server, `/api/invites/${made.id}`, operator)).status).toBe(404)
    expect((await listInvites(server, operator)).map((listed) => listed.id)).toEqual([
      open.id,
      made.id,
    ])
  })

  it('SEC-04: the database never holds an invite code', async () => {
    const { code } = await invite(server, operator)

    const dump = JSON.stringify((await server.db.execute(sql`select * from invites`)).rows)
    expect(dump).not.toContain(code)
    expect(dump).not.toContain(code.replaceAll('-', ''))
  })
})
