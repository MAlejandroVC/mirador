import {
  keysResponse,
  preloginResponse,
  sessionResponse,
  signUpError,
  type SignUpRequest,
  signUpStatus,
} from '@repo/api'
import { sql } from 'drizzle-orm'
import { schema } from '../store/db.ts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestApp, testHost, testOrigin, testSetupCode } from '../test-app.ts'

type TestServer = Awaited<ReturnType<typeof createTestApp>>

// Stand-ins for what the browser sends: the server can't tell them from real key
// material, which is the point. Real values come from @repo/crypto in the web app.
function base64Url(length: number, seed: string) {
  return Buffer.from(seed.repeat(length))
    .toString('base64url')
    .replace(/[^A-Za-z0-9_-]/g, 'x')
    .slice(0, length)
}

function newAccount(username: string, extra: Partial<SignUpRequest> = {}): SignUpRequest {
  return {
    username,
    loginSecret: base64Url(43, `login ${username}`),
    kdf: {
      algorithm: 'argon2id',
      salt: base64Url(22, `salt ${username}`),
      memoryKiB: 65536,
      iterations: 3,
      parallelism: 1,
    },
    wrappedAccountKey: {
      password: base64Url(54, `password-wrapped ${username}`),
      recovery: base64Url(54, `recovery-wrapped ${username}`),
    },
    recoverySecret: base64Url(43, `recovery ${username}`),
    ...extra,
  }
}

function post(server: TestServer, path: string, body: unknown, cookie?: string) {
  return server.app.request(path, {
    method: 'POST',
    headers: {
      Host: testHost,
      'Content-Type': 'application/json',
      Origin: testOrigin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

function get(server: TestServer, path: string, cookie?: string) {
  return server.app.request(path, {
    headers: { Host: testHost, ...(cookie ? { Cookie: cookie } : {}) },
  })
}

function cookieOf(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

async function signUp(server: TestServer, account: SignUpRequest) {
  const response = await post(server, '/api/accounts', account)
  expect(response.status).toBe(201)
  return cookieOf(response)
}

async function signIn(server: TestServer, username: string, loginSecret: string) {
  return post(server, '/api/auth/sign-in/username', {
    username,
    password: loginSecret,
    rememberMe: true,
  })
}

describe('sign-up', () => {
  let server: TestServer

  beforeEach(async () => {
    server = await createTestApp()
  })

  it('SYS-13: a new server asks for the setup code from its log before the first account', async () => {
    const status = signUpStatus.parse(await (await get(server, '/api/accounts/sign-up')).json())
    expect(status.mode).toBe('setup')

    const without = await post(server, '/api/accounts', newAccount('ana'))
    expect(without.status).toBe(403)
    expect(signUpError.parse(await without.json()).error).toBe('wrong-setup-code')

    const wrong = await post(
      server,
      '/api/accounts',
      newAccount('ana', { setupCode: 'NOTTHECODE' }),
    )
    expect(wrong.status).toBe(403)

    // Typed from the log: lower case, spaces for dashes, O for 0.
    await signUp(server, newAccount('ana', { setupCode: 'test setu pc0d e123 4567' }))
  })

  it('SYS-13: once an account exists, sign-up is closed unless the operator opens it', async () => {
    await signUp(server, newAccount('ana', { setupCode: testSetupCode }))

    const status = signUpStatus.parse(await (await get(server, '/api/accounts/sign-up')).json())
    expect(status.mode).toBe('closed')
    const refused = await post(
      server,
      '/api/accounts',
      newAccount('ben', { setupCode: testSetupCode }),
    )
    expect(refused.status).toBe(403)
    expect(signUpError.parse(await refused.json()).error).toBe('sign-up-closed')
  })

  it('SYS-13: open sign-up, when the operator turns it on, needs no code', async () => {
    server = await createTestApp({ openSignUp: true })
    await signUp(server, newAccount('ana', { setupCode: testSetupCode }))

    const status = signUpStatus.parse(await (await get(server, '/api/accounts/sign-up')).json())
    expect(status.mode).toBe('open')
    await signUp(server, newAccount('ben'))
  })

  it('SYS-06: a username can hold only one account, whatever its case', async () => {
    server = await createTestApp({ openSignUp: true })
    await signUp(server, newAccount('ana', { setupCode: testSetupCode }))

    const again = await post(server, '/api/accounts', newAccount(' Ana '))
    expect(again.status).toBe(409)
    expect(signUpError.parse(await again.json()).error).toBe('username-taken')
  })

  it("SYS-13: Better Auth's own sign-up, which skips these checks, is not reachable", async () => {
    const response = await post(server, '/api/auth/sign-up/email', {
      email: 'eve@example.com',
      password: base64Url(43, 'eve'),
      name: '',
    })

    expect(response.status).toBe(404)
  })

  it('SEC-03: rejects anything that is not a well-formed login secret and wrapped key', async () => {
    const account = newAccount('ana', { setupCode: testSetupCode })

    for (const body of [
      { ...account, loginSecret: 'my password' },
      { ...account, wrappedAccountKey: { password: 'short', recovery: 'short' } },
      { ...account, kdf: { ...account.kdf, algorithm: 'pbkdf2' } },
      { username: 'ana', password: 'hunter2' },
    ]) {
      expect((await post(server, '/api/accounts', body)).status).toBe(400)
    }
  })

  it('SYS-06: usernames are 3 to 32 letters, digits, dots, dashes or underscores', async () => {
    for (const name of ['ab', 'a'.repeat(33), 'ana maría', 'ana@example.com', 'añá']) {
      expect((await post(server, '/api/accounts', newAccount(name))).status).toBe(400)
    }
  })

  it('refuses a form post, so another site cannot submit to the API', async () => {
    const response = await server.app.request('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=ana',
    })

    expect(response.status).toBe(400)
  })
})

describe('sign-in', () => {
  let server: TestServer
  const ana = newAccount('ana', { setupCode: testSetupCode })

  beforeEach(async () => {
    server = await createTestApp()
    await signUp(server, ana)
  })

  it('SYS-06: sign-up signs the new account in on that device', async () => {
    server = await createTestApp()
    const cookie = await signUp(server, newAccount('ana', { setupCode: testSetupCode }))
    const session = sessionResponse.parse(
      await (await get(server, '/api/auth/get-session', cookie)).json(),
    )
    expect(session?.user.username).toBe('ana')
  })

  it('SYS-06: signs in with the login secret and stays signed in until signing out', async () => {
    const response = await signIn(server, 'ana', ana.loginSecret)
    expect(response.status).toBe(200)
    const cookie = cookieOf(response)
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i)
    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=\d{7}/)

    const session = sessionResponse.parse(
      await (await get(server, '/api/auth/get-session', cookie)).json(),
    )
    expect(session?.user.username).toBe('ana')

    expect((await post(server, '/api/auth/sign-out', {}, cookie)).status).toBe(200)
    const after = sessionResponse.parse(
      await (await get(server, '/api/auth/get-session', cookie)).json(),
    )
    expect(after).toBeNull()
  })

  it('SYS-06: signs in only by username; the stored email is made up and unused', async () => {
    const byEmail = await post(server, '/api/auth/sign-in/email', {
      email: 'ana@users.invalid',
      password: ana.loginSecret,
    })
    expect(byEmail.status).toBe(404)

    const [user] = await server.db.select().from(schema.users)
    expect(user).toMatchObject({ username: 'ana', email: 'ana@users.invalid' })
  })

  it('SEC-03: a wrong login secret or unknown username is refused the same way', async () => {
    const wrong = await signIn(server, 'ana', base64Url(43, 'guess'))
    const unknown = await signIn(server, 'nobody', ana.loginSecret)

    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await wrong.json()).toEqual(await unknown.json())
  })

  it('SEC-02: prelogin returns the salt and cost the account was made with', async () => {
    const response = await post(server, '/api/accounts/prelogin', { username: 'ANA' })

    expect(preloginResponse.parse(await response.json()).kdf).toEqual(ana.kdf)
  })

  it('SEC-03: prelogin answers an unknown username with steady, made-up settings', async () => {
    const ask = async (username: string) =>
      preloginResponse.parse(
        await (await post(server, '/api/accounts/prelogin', { username })).json(),
      ).kdf

    const first = await ask('nobody')
    expect(await ask('nobody')).toEqual(first)
    expect((await ask('someone')).salt).not.toBe(first.salt)
    expect(first).toMatchObject({ algorithm: 'argon2id', memoryKiB: 65536, iterations: 3 })
    expect(Buffer.from(first.salt, 'base64url')).toHaveLength(16)
  })
})

describe('key material', () => {
  let server: TestServer
  const ana = newAccount('ana', { setupCode: testSetupCode })
  const ben = newAccount('ben')

  beforeEach(async () => {
    server = await createTestApp({ openSignUp: true })
    await signUp(server, ana)
    await signUp(server, ben)
  })

  it('SEC-09: hands each user only their own wrapped key, and nothing when signed out', async () => {
    expect((await get(server, '/api/keys')).status).toBe(401)

    for (const account of [ana, ben]) {
      const cookie = cookieOf(await signIn(server, account.username, account.loginSecret))
      const keys = keysResponse.parse(await (await get(server, '/api/keys', cookie)).json())
      expect(keys).toEqual({
        kdf: account.kdf,
        wrappedAccountKey: account.wrappedAccountKey.password,
      })
    }
  })

  it('SEC-04: the database never holds the login secret or the recovery secret', async () => {
    const dump = JSON.stringify(
      await Promise.all(
        ['users', 'sessions', 'accounts', 'verifications', 'key_material', 'server_settings'].map(
          (table) => server.db.execute(sql.raw(`select * from ${table}`)),
        ),
      ),
    )

    for (const account of [ana, ben]) {
      expect(dump).toContain(account.wrappedAccountKey.password)
      expect(dump).not.toContain(account.loginSecret)
      expect(dump).not.toContain(account.recoverySecret)
    }
  })
})
