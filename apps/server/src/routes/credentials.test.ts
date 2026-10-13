import { keysResponse, sessionResponse, signOutOthersResponse } from '@repo/api'
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

const ana = newAccount('ana', { setupCode: testSetupCode })
const newPassword = {
  newLoginSecret: base64Url(43, 'new login'),
  kdf: { ...ana.kdf, salt: base64Url(22, 'new salt') },
  wrappedAccountKey: base64Url(54, 'new password-wrapped'),
}
const newRecoveryKey = {
  recoverySecret: base64Url(43, 'new recovery'),
  wrappedAccountKey: base64Url(54, 'new recovery-wrapped'),
}

function signIn(server: TestServer, loginSecret = ana.loginSecret) {
  return post(server, '/api/session', { username: 'ana', loginSecret })
}

async function signedInAs(server: TestServer, cookie: string) {
  const session = sessionResponse.parse(await (await get(server, '/api/session', cookie)).json())
  return session?.user.username ?? null
}

describe('changing credentials', () => {
  let server: TestServer
  let phone: string

  beforeEach(async () => {
    server = await createTestApp({ trustProxy: true, openSignUp: true })
    phone = await signUp(server, ana)
  })

  it('SEC-08: changes the password with the current one, signs other devices out and keeps this one in', async () => {
    const laptop = cookieOf(await signIn(server))

    const response = await post(
      server,
      '/api/accounts/password',
      { loginSecret: ana.loginSecret, ...newPassword },
      { Cookie: phone },
    )

    expect(response.status).toBe(204)
    const renewed = cookieOf(response)
    expect(renewed).not.toBe(phone)
    expect(await signedInAs(server, renewed)).toBe('ana')
    expect(await signedInAs(server, phone)).toBeNull()
    expect(await signedInAs(server, laptop)).toBeNull()
    const keys = keysResponse.parse(await (await get(server, '/api/keys', renewed)).json())
    expect(keys).toEqual({ kdf: newPassword.kdf, wrappedAccountKey: newPassword.wrappedAccountKey })
    expect((await signIn(server)).status).toBe(401)
    expect((await signIn(server, newPassword.newLoginSecret)).status).toBe(204)
  })

  it('SEC-08: a session alone, or a wrong current password, changes nothing', async () => {
    const wrong = await post(
      server,
      '/api/accounts/password',
      { loginSecret: base64Url(43, 'guess'), ...newPassword },
      { Cookie: phone },
    )
    const replace = await post(
      server,
      '/api/accounts/recovery-key',
      { loginSecret: base64Url(43, 'guess'), ...newRecoveryKey },
      { Cookie: phone },
    )
    const signedOut = await post(server, '/api/accounts/password', {
      loginSecret: ana.loginSecret,
      ...newPassword,
    })

    expect(wrong.status).toBe(401)
    expect(await wrong.json()).toEqual({ error: 'wrong-password' })
    expect(replace.status).toBe(401)
    expect(signedOut.status).toBe(401)
    expect(await signedOut.json()).toEqual({ error: 'signed-out' })
    expect(await signedInAs(server, phone)).toBe('ana')
    expect((await signIn(server)).status).toBe(204)
    const recovery = await post(server, '/api/accounts/recovery/key', {
      username: 'ana',
      recoverySecret: ana.recoverySecret,
    })
    expect(recovery.status).toBe(200)
  })

  it('SEC-08: ten wrong current passwords make it wait, even from new addresses', async () => {
    for (let guess = 0; guess < 10; guess += 1) {
      const response = await post(
        server,
        '/api/accounts/password',
        { loginSecret: base64Url(43, `guess ${guess}`), ...newPassword },
        { Cookie: phone, 'X-Forwarded-For': `198.51.100.${guess}` },
      )
      expect(response.status).toBe(401)
    }

    const blocked = await post(
      server,
      '/api/accounts/recovery-key',
      { loginSecret: ana.loginSecret, ...newRecoveryKey },
      { Cookie: phone, 'X-Forwarded-For': '203.0.113.7' },
    )
    expect(blocked.status).toBe(429)
  })

  it('SEC-08: a new recovery key replaces the old one and keeps everyone signed in', async () => {
    const laptop = cookieOf(await signIn(server))

    const response = await post(
      server,
      '/api/accounts/recovery-key',
      { loginSecret: ana.loginSecret, ...newRecoveryKey },
      { Cookie: phone },
    )

    expect(response.status).toBe(204)
    const recoveryKey = (recoverySecret: string) =>
      post(server, '/api/accounts/recovery/key', { username: 'ana', recoverySecret })
    expect((await recoveryKey(ana.recoverySecret)).status).toBe(401)
    const fresh = await recoveryKey(newRecoveryKey.recoverySecret)
    expect(await fresh.json()).toEqual({ wrappedAccountKey: newRecoveryKey.wrappedAccountKey })
    expect(await signedInAs(server, phone)).toBe('ana')
    expect(await signedInAs(server, laptop)).toBe('ana')
  })

  it('SEC-08: signs out every other device and keeps this one', async () => {
    const laptop = cookieOf(await signIn(server))
    const tablet = cookieOf(await signIn(server))
    const ben = await signUp(server, newAccount('ben'))

    const response = await del(server, '/api/session/others', phone)

    expect(signOutOthersResponse.parse(await response.json())).toEqual({ signedOut: 2 })
    expect(await signedInAs(server, phone)).toBe('ana')
    expect(await signedInAs(server, laptop)).toBeNull()
    expect(await signedInAs(server, tablet)).toBeNull()
    // SEC-09: someone else's devices are theirs.
    expect(await signedInAs(server, ben)).toBe('ben')
    expect((await del(server, '/api/session/others')).status).toBe(401)
  })

  it('SYS-06: changes the username with the current password, and keeps every device in', async () => {
    const laptop = cookieOf(await signIn(server))

    const response = await post(
      server,
      '/api/accounts/username',
      { username: ' Ana.Maria ', loginSecret: ana.loginSecret },
      { Cookie: phone },
    )

    expect(response.status).toBe(204)
    expect(await signedInAs(server, phone)).toBe('ana.maria')
    expect(await signedInAs(server, laptop)).toBe('ana.maria')
    expect((await signIn(server)).status).toBe(401)
    const renamed = await post(server, '/api/session', {
      username: 'ana.maria',
      loginSecret: ana.loginSecret,
    })
    expect(renamed.status).toBe(204)
    // The old name is free again.
    await signUp(server, newAccount('ana'))
  })

  it('SYS-06: a taken username, a wrong password or no session changes nothing', async () => {
    await signUp(server, newAccount('ben'))
    const rename = (body: object, cookie?: string) =>
      post(server, '/api/accounts/username', body, cookie ? { Cookie: cookie } : {})

    const taken = await rename({ username: 'ben', loginSecret: ana.loginSecret }, phone)
    const wrong = await rename({ username: 'carla', loginSecret: base64Url(43, 'guess') }, phone)
    const signedOut = await rename({ username: 'carla', loginSecret: ana.loginSecret })
    const invalid = await rename({ username: 'no spaces', loginSecret: ana.loginSecret }, phone)

    expect(taken.status).toBe(409)
    expect(await taken.json()).toEqual({ error: 'username-taken' })
    expect(wrong.status).toBe(401)
    expect(await wrong.json()).toEqual({ error: 'wrong-password' })
    expect(signedOut.status).toBe(401)
    expect(invalid.status).toBe(400)
    expect(await signedInAs(server, phone)).toBe('ana')
    // Its own name again is no change at all.
    expect((await rename({ username: 'ana', loginSecret: ana.loginSecret }, phone)).status).toBe(
      204,
    )
  })

  it('SEC-04: the database never holds the new login secret or recovery secret', async () => {
    const response = await post(
      server,
      '/api/accounts/password',
      { loginSecret: ana.loginSecret, ...newPassword },
      { Cookie: phone },
    )
    await post(
      server,
      '/api/accounts/recovery-key',
      { loginSecret: newPassword.newLoginSecret, ...newRecoveryKey },
      { Cookie: cookieOf(response) },
    )

    const dump = JSON.stringify(
      await Promise.all(
        ['users', 'sessions', 'key_material', 'server_settings'].map((table) =>
          server.db.execute(sql.raw(`select * from ${table}`)),
        ),
      ),
    )
    expect(dump).toContain(newPassword.wrappedAccountKey)
    expect(dump).toContain(newRecoveryKey.wrappedAccountKey)
    expect(dump).not.toContain(newPassword.newLoginSecret)
    expect(dump).not.toContain(newRecoveryKey.recoverySecret)
  })
})
