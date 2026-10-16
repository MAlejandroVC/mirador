import { invitesResponse, newInviteResponse, sessionResponse, signUpError } from '@repo/api'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createTestApp,
  get,
  newAccount,
  post,
  signUp,
  testSetupCode,
  type TestServer,
} from '../test-app.ts'

const day = 24 * 60 * 60 * 1000
const inDays = (days: number) => new Date(Date.now() + days * day).toISOString()

async function invite(
  server: TestServer,
  cookie: string,
  { days = 7, maxUses = 1 }: { days?: number; maxUses?: number | null } = {},
) {
  const response = await post(
    server,
    '/api/invites',
    { expiresAt: inDays(days), maxUses },
    { Cookie: cookie },
  )
  expect(response.status).toBe(201)
  return newInviteResponse.parse(await response.json())
}

async function listInvites(server: TestServer, cookie: string) {
  return invitesResponse.parse(await (await get(server, '/api/invites', cookie)).json()).invites
}

async function sessionOf(server: TestServer, cookie: string) {
  return sessionResponse.parse(await (await get(server, '/api/session', cookie)).json())
}

function end(server: TestServer, id: string, cookie: string) {
  return post(server, `/api/invites/${id}/end`, {}, { Cookie: cookie })
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
    expect(first.useCount).toBe(0)
  })

  it('SYS-13: a one-person invite signs up one person, once, and says who joined', async () => {
    const { invite: made, code } = await invite(server, operator)

    // Typed by hand: lower case, spaces for dashes.
    await signUp(server, newAccount('ben', { inviteCode: code.toLowerCase().replaceAll('-', ' ') }))
    const again = await post(server, '/api/accounts', newAccount('cleo', { inviteCode: code }))

    expect(again.status).toBe(403)
    expect(signUpError.parse(await again.json()).error).toBe('wrong-invite')
    const [listed] = await listInvites(server, operator)
    expect(listed).toMatchObject({ id: made.id, maxUses: 1, useCount: 1, joined: ['ben'] })
  })

  it('SYS-21: one link signs up as many people as it allows, then stops', async () => {
    const { invite: made, code } = await invite(server, operator, { maxUses: 3 })

    for (const username of ['ben', 'cleo', 'dani']) {
      await signUp(server, newAccount(username, { inviteCode: code }))
    }
    const fourth = await post(server, '/api/accounts', newAccount('eli', { inviteCode: code }))

    expect(fourth.status).toBe(403)
    const [listed] = await listInvites(server, operator)
    expect(listed).toMatchObject({ id: made.id, useCount: 3, joined: ['ben', 'cleo', 'dani'] })
  })

  it('SYS-21: two people taking the last use at once get one account between them', async () => {
    const { code } = await invite(server, operator, { maxUses: 1 })

    const answers = await Promise.all(
      ['ben', 'cleo'].map(
        async (username) =>
          await post(server, '/api/accounts', newAccount(username, { inviteCode: code })),
      ),
    )

    expect(answers.map((answer) => answer.status).sort()).toEqual([201, 403])
    const [listed] = await listInvites(server, operator)
    expect(listed?.useCount).toBe(1)
  })

  it('SYS-21: a link with no limit works until it expires', async () => {
    const { code } = await invite(server, operator, { maxUses: null })

    for (const username of ['ben', 'cleo', 'dani', 'eli']) {
      await signUp(server, newAccount(username, { inviteCode: code }))
    }
    await server.db.execute(sql`update invites set expires_at = now() - interval '1 minute'`)
    const late = await post(server, '/api/accounts', newAccount('fer', { inviteCode: code }))

    expect(late.status).toBe(403)
    expect((await listInvites(server, operator))[0]).toMatchObject({ maxUses: null, useCount: 4 })
  })

  it('SYS-21: the operator chooses the expiry, within a year', async () => {
    for (const expiresAt of [inDays(-1), inDays(366)]) {
      const refused = await post(
        server,
        '/api/invites',
        { expiresAt, maxUses: 5 },
        { Cookie: operator },
      )
      expect(refused.status).toBe(400)
    }
    for (const maxUses of [0, 1001]) {
      const refused = await post(
        server,
        '/api/invites',
        { expiresAt: inDays(7), maxUses },
        { Cookie: operator },
      )
      expect(refused.status).toBe(400)
    }
    const { invite: made } = await invite(server, operator, { days: 30, maxUses: 10 })
    expect(Date.parse(made.expiresAt) - Date.now()).toBeGreaterThan(29 * day)
  })

  it('SYS-21: ending a link early stops it, and whoever joined keeps their account', async () => {
    const { invite: made, code } = await invite(server, operator, { maxUses: 10 })
    const ben = await signUp(server, newAccount('ben', { inviteCode: code }))

    expect((await end(server, made.id, operator)).status).toBe(204)
    const late = await post(server, '/api/accounts', newAccount('cleo', { inviteCode: code }))

    expect(late.status).toBe(403)
    expect((await sessionOf(server, ben))?.user.username).toBe('ben')
    const [listed] = await listInvites(server, operator)
    expect(listed?.endedAt).not.toBeNull()
    expect(listed?.joined).toEqual(['ben'])
    // Already ended.
    expect((await end(server, made.id, operator)).status).toBe(404)
  })

  it('SYS-13: a wrong, ended or expired invite creates nothing', async () => {
    const { invite: ended, code: endedCode } = await invite(server, operator)
    const { code: expiredCode } = await invite(server, operator)
    expect((await end(server, ended.id, operator)).status).toBe(204)
    await server.db.execute(sql`update invites set expires_at = now() - interval '1 minute'`)

    for (const inviteCode of ['NOTA-REAL-INVI-TECO-DE00', endedCode, expiredCode, undefined]) {
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
    const { code: endedCode, invite: ended } = await invite(server, operator)
    expect((await end(server, ended.id, operator)).status).toBe(204)
    const check = (username: string, inviteCode?: string) =>
      post(server, '/api/accounts/username-check', {
        username,
        ...(inviteCode ? { inviteCode } : {}),
      })

    // Otherwise anyone could find out who has an account here.
    for (const inviteCode of [undefined, 'NOTA-REAL-INVI-TECO-DE00', endedCode]) {
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

  it('SYS-13: only the operator makes, lists and ends invites', async () => {
    const { invite: made, code } = await invite(server, operator)
    const ben = await signUp(server, newAccount('ben', { inviteCode: code }))
    const { invite: open } = await invite(server, operator)

    expect(
      (await post(server, '/api/invites', { expiresAt: inDays(7), maxUses: 1 }, { Cookie: ben }))
        .status,
    ).toBe(403)
    expect((await get(server, '/api/invites', ben)).status).toBe(403)
    expect((await end(server, open.id, ben)).status).toBe(403)
    expect((await get(server, '/api/invites')).status).toBe(401)
    expect((await listInvites(server, operator)).map((listed) => listed.id)).toEqual([
      open.id,
      made.id,
    ])
  })

  it('SEC-04: the database never holds an invite code', async () => {
    const { code } = await invite(server, operator, { maxUses: null })

    const dump = JSON.stringify((await server.db.execute(sql`select * from invites`)).rows)
    expect(dump).not.toContain(code)
    expect(dump).not.toContain(code.replaceAll('-', ''))
  })
})
