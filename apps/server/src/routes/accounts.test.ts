import {
  keysResponse,
  preloginResponse,
  sessionResponse,
  sessionError,
  signUpError,
  signUpStatus,
  usernameCheckResponse,
} from '@repo/api'
import { sql } from 'drizzle-orm'
import { schema } from '../store/db.ts'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  base64Url,
  cookieOf,
  createTestApp,
  get,
  newAccount,
  post,
  signUp,
  testHost,
  testOrigin,
  testSetupCode,
  type TestServer,
} from '../test-app.ts'

function signIn(
  server: TestServer,
  username: string,
  loginSecret: string,
  headers: Record<string, string> = {},
) {
  return post(server, '/api/session', { username, loginSecret }, headers)
}

function signOut(server: TestServer, cookie: string) {
  return server.app.request('/api/session', {
    method: 'DELETE',
    headers: { Host: testHost, Origin: testOrigin, Cookie: cookie },
  })
}

async function sessionOf(server: TestServer, cookie: string) {
  return sessionResponse.parse(await (await get(server, '/api/session', cookie)).json())
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

  it('SYS-13: once an account exists, sign-up needs an invite unless the operator opens it', async () => {
    await signUp(server, newAccount('ana', { setupCode: testSetupCode }))

    const status = signUpStatus.parse(await (await get(server, '/api/accounts/sign-up')).json())
    expect(status.mode).toBe('invite')
    const refused = await post(
      server,
      '/api/accounts',
      newAccount('ben', { setupCode: testSetupCode }),
    )
    expect(refused.status).toBe(403)
    expect(signUpError.parse(await refused.json()).error).toBe('wrong-invite')
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

  it('SYS-06: says whether a username is free before signing up', async () => {
    server = await createTestApp({ openSignUp: true })
    const check = async (username: string) => {
      const response = await post(server, '/api/accounts/username-check', { username })
      expect(response.status).toBe(200)
      return usernameCheckResponse.parse(await response.json()).available
    }

    expect(await check('ana')).toBe(true)
    await signUp(server, newAccount('ana', { setupCode: testSetupCode }))
    expect(await check(' Ana ')).toBe(false)
    expect(await check('ben')).toBe(true)
    const invalid = await post(server, '/api/accounts/username-check', { username: 'a b' })
    expect(invalid.status).toBe(400)
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
      headers: {
        Host: testHost,
        Origin: testOrigin,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'username=ana',
    })

    expect(response.status).toBe(400)
  })
})

describe('sign-in', () => {
  let server: TestServer
  const ana = newAccount('ana', { setupCode: testSetupCode })

  beforeEach(async () => {
    server = await createTestApp({ trustProxy: true })
    await signUp(server, ana)
  })

  it('SYS-06: sign-up signs the new account in on that device', async () => {
    server = await createTestApp()
    const cookie = await signUp(server, newAccount('ana', { setupCode: testSetupCode }))

    expect((await sessionOf(server, cookie))?.user.username).toBe('ana')
  })

  it('SYS-06: signs in with the login secret and stays signed in until signing out', async () => {
    const response = await signIn(server, 'ANA', ana.loginSecret)
    expect(response.status).toBe(204)
    const cookie = cookieOf(response)
    expect((await sessionOf(server, cookie))?.user.username).toBe('ana')

    expect((await signOut(server, cookie)).status).toBe(204)
    expect(await sessionOf(server, cookie)).toBeNull()
    expect((await get(server, '/api/keys', cookie)).status).toBe(401)
  })

  it('SEC-09: the session cookie is out of reach of scripts and other sites', async () => {
    const cookie = (await signIn(server, 'ana', ana.loginSecret)).headers.get('set-cookie')

    expect(cookie).toMatch(/^__Host-mirador_session=[A-Za-z0-9_-]{43};/)
    for (const attribute of [
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      'Path=/',
      'Max-Age=5184000',
    ]) {
      expect(cookie).toContain(attribute)
    }
    expect(cookie).not.toMatch(/Domain/i)
  })

  it('SYS-06: signing in again on a device replaces its session', async () => {
    const first = cookieOf(await signIn(server, 'ana', ana.loginSecret))
    const second = cookieOf(await signIn(server, 'ana', ana.loginSecret, { Cookie: first }))

    expect(await sessionOf(server, first)).toBeNull()
    expect((await sessionOf(server, second))?.user.username).toBe('ana')
  })

  it('SYS-06: a session ends after 60 unused days, and each day of use extends it', async () => {
    const cookie = cookieOf(await signIn(server, 'ana', ana.loginSecret))
    const day = 24 * 60 * 60 * 1000
    const setExpiry = (inDays: number) =>
      server.db.update(schema.sessions).set({ expiresAt: new Date(Date.now() + inDays * day) })

    await setExpiry(58)
    const used = await get(server, '/api/session', cookie)
    expect(used.headers.get('set-cookie')).toMatch(/Max-Age=5184000/)
    // Sign-up in beforeEach left another session, which wasn't used.
    const ends = (await server.db.select().from(schema.sessions)).map((row) =>
      row.expiresAt.getTime(),
    )
    expect(Math.max(...ends)).toBeGreaterThan(Date.now() + 59 * day)
    expect(Math.min(...ends)).toBeLessThan(Date.now() + 59 * day)

    await setExpiry(-1)
    expect(await sessionOf(server, cookie)).toBeNull()
  })

  it('SEC-04: the database keeps only a hash of each session token', async () => {
    const response = await signIn(server, 'ana', ana.loginSecret)
    const token = /__Host-mirador_session=([^;]+)/.exec(cookieOf(response))![1]!

    const dump = JSON.stringify(await server.db.select().from(schema.sessions))
    expect(dump).not.toContain(token)
    expect(await sessionOf(server, `__Host-mirador_session=${token}x`)).toBeNull()
  })

  it('SEC-03: a wrong login secret or unknown username is refused the same way', async () => {
    const wrong = await signIn(server, 'ana', base64Url(43, 'guess'))
    const unknown = await signIn(server, 'nobody', ana.loginSecret)

    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await wrong.json()).toEqual(await unknown.json())
    expect(wrong.headers.get('set-cookie')).toBeNull()
  })

  it('SEC-03: after ten wrong guesses from one address, that address waits for the username', async () => {
    const attacker = { 'X-Forwarded-For': '198.51.100.9' }
    for (let guess = 0; guess < 10; guess += 1) {
      const response = await signIn(server, 'ana', base64Url(43, `guess ${guess}`), attacker)
      expect(response.status).toBe(401)
    }

    const blocked = await signIn(server, 'ana', ana.loginSecret, attacker)
    expect(blocked.status).toBe(429)
    expect(sessionError.parse(await blocked.json()).error).toBe('too-many-attempts')
    // Guessing wrong on purpose can't lock Ana out of her own devices.
    const own = await signIn(server, 'ana', ana.loginSecret, { 'X-Forwarded-For': '10.0.1.1' })
    expect(own.status).toBe(204)
  })

  it('SEC-03: guesses sent all at once count too', async () => {
    const attacker = { 'X-Forwarded-For': '198.51.100.10' }
    const statuses = await Promise.all(
      Array.from({ length: 15 }, (_, guess) =>
        Promise.resolve(signIn(server, 'ana', base64Url(43, `guess ${guess}`), attacker)).then(
          (response) => response.status,
        ),
      ),
    )

    expect(statuses.filter((status) => status === 401)).toHaveLength(10)
    expect(statuses.filter((status) => status === 429)).toHaveLength(5)
  })

  it('SEC-03: X-Forwarded-For counts only when a proxy is said to be in front', async () => {
    server = await createTestApp()
    await signUp(server, ana)
    const statuses = []
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const madeUp = { 'X-Forwarded-For': `192.0.2.${attempt}` }
      statuses.push((await signIn(server, `user${attempt}`, ana.loginSecret, madeUp)).status)
    }

    expect(statuses.at(-1)).toBe(429)
  })

  it('SEC-03: an IPv6 /64 counts as one address', async () => {
    const statuses = []
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const address = { 'X-Forwarded-For': `2001:db8:1:2::${attempt.toString(16)}` }
      statuses.push((await signIn(server, `user${attempt}`, ana.loginSecret, address)).status)
    }

    expect(statuses.at(-1)).toBe(429)
  })

  it('SEC-03: guesses at one account from many addresses are capped for the whole account', async () => {
    const statuses = []
    for (let guess = 0; guess < 21; guess += 1) {
      const address = { 'X-Forwarded-For': `198.51.${guess}.1` }
      statuses.push((await signIn(server, 'ana', base64Url(43, `guess ${guess}`), address)).status)
    }

    expect(statuses.slice(0, 20)).toEqual(Array(20).fill(401))
    expect(statuses[20]).toBe(429)
    // A new browser has to wait too, even with the right password.
    const newBrowser = await signIn(server, 'ana', ana.loginSecret, {
      'X-Forwarded-For': '203.0.113.50',
    })
    expect(newBrowser.status).toBe(429)
  })

  it('SEC-03: a browser that signed in before keeps its own allowance while others guess', async () => {
    const anasPhone = cookieOf(await signIn(server, 'ana', ana.loginSecret))
    expect(anasPhone).toContain('__Host-mirador_device=')
    for (let guess = 0; guess < 21; guess += 1) {
      const address = { 'X-Forwarded-For': `198.51.${guess}.1` }
      await signIn(server, 'ana', base64Url(43, `guess ${guess}`), address)
    }

    const own = await signIn(server, 'ana', ana.loginSecret, {
      Cookie: anasPhone,
      'X-Forwarded-For': '203.0.113.51',
    })
    expect(own.status).toBe(204)
  })

  it("SEC-03: another account's device cookie, or a made-up one, gets no allowance of its own", async () => {
    server = await createTestApp({ trustProxy: true, openSignUp: true })
    await signUp(server, ana)
    const bensPhone = await signUp(server, newAccount('ben'))
    for (let guess = 0; guess < 20; guess += 1) {
      const address = { 'X-Forwarded-For': `198.51.${guess}.1` }
      await signIn(server, 'ana', base64Url(43, `guess ${guess}`), address)
    }

    for (const cookie of [bensPhone, '__Host-mirador_device=made.up']) {
      const response = await signIn(server, 'ana', ana.loginSecret, {
        Cookie: cookie,
        'X-Forwarded-For': '203.0.113.52',
      })
      expect(response.status).toBe(429)
    }
  })

  it('SEC-03: a browser that signed in before still gets only ten wrong guesses', async () => {
    const anasPhone = cookieOf(await signIn(server, 'ana', ana.loginSecret))
    const statuses = []
    for (let guess = 0; guess < 11; guess += 1) {
      const headers = { Cookie: anasPhone, 'X-Forwarded-For': `198.51.${guess}.1` }
      statuses.push((await signIn(server, 'ana', base64Url(43, `guess ${guess}`), headers)).status)
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401))
    expect(statuses[10]).toBe(429)
  })

  it('SEC-03: an IPv4 address written as IPv6 counts as that IPv4 address', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const mapped = { 'X-Forwarded-For': '::ffff:203.0.113.9' }
      await post(server, '/api/accounts/prelogin', { username: 'ana' }, mapped)
    }

    const plain = await post(
      server,
      '/api/accounts/prelogin',
      { username: 'ana' },
      { 'X-Forwarded-For': '203.0.113.9' },
    )
    expect(plain.status).toBe(429)
  })

  it('SEC-03: a whole IPv6 /48 gets a limited number of attempts a minute', async () => {
    const statuses = []
    for (let attempt = 0; attempt < 121; attempt += 1) {
      const address = { 'X-Forwarded-For': `2001:db8:1:${attempt.toString(16)}::1` }
      statuses.push(
        (await post(server, '/api/accounts/prelogin', { username: 'ana' }, address)).status,
      )
    }

    expect(statuses.slice(0, 120)).toEqual(Array(120).fill(200))
    expect(statuses[120]).toBe(429)
    const elsewhere = { 'X-Forwarded-For': '2001:db8:2::1' }
    expect(
      (await post(server, '/api/accounts/prelogin', { username: 'ana' }, elsewhere)).status,
    ).toBe(200)
  })

  it('refuses a request body far larger than any real one', async () => {
    const response = await post(server, '/api/session', {
      username: 'ana',
      loginSecret: ana.loginSecret,
      padding: 'x'.repeat(100 * 1024),
    })

    expect(response.status).toBe(413)
  })

  it('SEC-03: one address gets a limited number of attempts a minute', async () => {
    const address = { 'X-Forwarded-For': '203.0.113.7' }
    const statuses = []
    for (let attempt = 0; attempt < 31; attempt += 1) {
      statuses.push((await signIn(server, `user${attempt}`, ana.loginSecret, address)).status)
    }

    expect(statuses.slice(0, 30)).toEqual(Array(30).fill(401))
    expect(statuses[30]).toBe(429)
    const elsewhere = await signIn(server, 'ana', ana.loginSecret, {
      'X-Forwarded-For': '203.0.113.8',
    })
    expect(elsewhere.status).toBe(204)
  })

  it('SEC-09: refuses a request another site makes in the browser', async () => {
    const response = await signIn(server, 'ana', ana.loginSecret, {
      Origin: 'https://evil.example',
    })

    expect(response.status).toBe(403)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('SEC-09: refuses a request that changes something without saying where it comes from', async () => {
    const response = await server.app.request('/api/session', {
      method: 'POST',
      headers: { Host: testHost, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ana', loginSecret: ana.loginSecret }),
    })
    const fromTheApp = await server.app.request('/api/session', {
      method: 'POST',
      headers: {
        Host: testHost,
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'same-origin',
      },
      body: JSON.stringify({ username: 'ana', loginSecret: ana.loginSecret }),
    })

    expect(response.status).toBe(403)
    expect(fromTheApp.status).toBe(204)
  })

  it('SEC-09: X-Forwarded-Host counts only when a proxy is said to be in front', async () => {
    server = await createTestApp()
    await signUp(server, ana)
    const response = await signIn(server, 'ana', ana.loginSecret, {
      Origin: 'https://evil.example',
      'X-Forwarded-Host': 'evil.example',
    })

    expect(response.status).toBe(403)
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
        ['users', 'sessions', 'key_material', 'server_settings'].map((table) =>
          server.db.execute(sql.raw(`select * from ${table}`)),
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
