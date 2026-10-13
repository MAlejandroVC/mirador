import { keysResponse, recoveryKeyResponse, sessionError, sessionResponse } from '@repo/api'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  base64Url,
  cookieOf,
  createTestApp,
  get,
  newAccount,
  post,
  signUp,
  testSetupCode,
  type TestServer,
} from '../test-app.ts'

const ana = newAccount('ana', { setupCode: testSetupCode })
const fresh = {
  loginSecret: base64Url(43, 'new login'),
  kdf: { ...ana.kdf, salt: base64Url(22, 'new salt') },
  wrappedAccountKey: base64Url(54, 'new password-wrapped'),
}

function recover(server: TestServer, recoverySecret = ana.recoverySecret, username = 'ana') {
  return post(server, '/api/accounts/recovery', { username, recoverySecret, ...fresh })
}

function signIn(server: TestServer, loginSecret: string) {
  return post(server, '/api/session', { username: 'ana', loginSecret })
}

describe('recovery', () => {
  let server: TestServer
  let oldSession: string

  beforeEach(async () => {
    server = await createTestApp({ trustProxy: true })
    oldSession = await signUp(server, ana)
  })

  it('SEC-07: the recovery secret gets the key wrapped by the recovery key, and nothing else does', async () => {
    const right = await post(server, '/api/accounts/recovery/key', {
      username: 'ana',
      recoverySecret: ana.recoverySecret,
    })
    expect(recoveryKeyResponse.parse(await right.json())).toEqual({
      wrappedAccountKey: ana.wrappedAccountKey.recovery,
    })

    const wrong = await post(server, '/api/accounts/recovery/key', {
      username: 'ana',
      recoverySecret: base64Url(43, 'guess'),
    })
    const unknown = await post(server, '/api/accounts/recovery/key', {
      username: 'nobody',
      recoverySecret: ana.recoverySecret,
    })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(sessionError.parse(await wrong.json()).error).toBe('wrong-recovery-key')
    expect(await unknown.json()).toEqual({ error: 'wrong-recovery-key' })
  })

  it('SEC-07: sets the new password, signs every device out and this one in', async () => {
    const response = await recover(server)
    expect(response.status).toBe(204)
    const cookie = cookieOf(response)

    const keys = keysResponse.parse(await (await get(server, '/api/keys', cookie)).json())
    expect(keys).toEqual({ kdf: fresh.kdf, wrappedAccountKey: fresh.wrappedAccountKey })
    expect(
      sessionResponse.parse(await (await get(server, '/api/session', oldSession)).json()),
    ).toBeNull()
    expect((await signIn(server, ana.loginSecret)).status).toBe(401)
    expect((await signIn(server, fresh.loginSecret)).status).toBe(204)
    // The recovery key keeps working for next time.
    expect(
      (
        await post(server, '/api/accounts/recovery/key', {
          username: 'ana',
          recoverySecret: ana.recoverySecret,
        })
      ).status,
    ).toBe(200)
  })

  it('SEC-07: a wrong recovery key changes nothing', async () => {
    const response = await recover(server, base64Url(43, 'guess'))

    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect((await signIn(server, ana.loginSecret)).status).toBe(204)
  })

  it('SEC-07: ten wrong recovery keys from one address make it wait', async () => {
    const attacker = { 'X-Forwarded-For': '198.51.100.20' }
    for (let guess = 0; guess < 10; guess += 1) {
      const body = { username: 'ana', recoverySecret: base64Url(43, `guess ${guess}`) }
      expect((await post(server, '/api/accounts/recovery/key', body, attacker)).status).toBe(401)
    }

    const blocked = await post(
      server,
      '/api/accounts/recovery',
      { username: 'ana', recoverySecret: ana.recoverySecret, ...fresh },
      attacker,
    )
    expect(blocked.status).toBe(429)
    expect((await recover(server)).status).toBe(204)
  })

  it('SEC-04: the database never holds the recovery secret or the new login secret', async () => {
    await recover(server)

    const dump = JSON.stringify(
      await Promise.all(
        ['users', 'sessions', 'key_material', 'server_settings'].map((table) =>
          server.db.execute(sql.raw(`select * from ${table}`)),
        ),
      ),
    )
    expect(dump).toContain(fresh.wrappedAccountKey)
    expect(dump).not.toContain(ana.recoverySecret)
    expect(dump).not.toContain(fresh.loginSecret)
  })
})
