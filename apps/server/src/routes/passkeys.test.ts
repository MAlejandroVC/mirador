import {
  passkeySignInResponse,
  passkeysResponse,
  registrationOptionsResponse,
  sessionResponse,
  signInOptionsResponse,
} from '@repo/api'
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
import { type FakePasskey, fakePasskey } from '../test-passkey.ts'

const ana = newAccount('ana', { setupCode: testSetupCode })
const bob = newAccount('bob')
const anaPasskeyWrapped = base64Url(54, 'passkey-wrapped ana')

async function registrationFor(server: TestServer, cookie: string) {
  const response = await post(server, '/api/passkeys/registration', {}, { Cookie: cookie })
  expect(response.status).toBe(200)
  return registrationOptionsResponse.parse(await response.json())
}

async function addPasskey(
  server: TestServer,
  cookie: string,
  passkey: FakePasskey,
  { loginSecret = ana.loginSecret, wrappedAccountKey = anaPasskeyWrapped } = {},
) {
  const { challengeId, options } = await registrationFor(server, cookie)
  const response = await passkey.register({ challenge: options.challenge })
  return post(
    server,
    '/api/passkeys',
    { challengeId, response, loginSecret, wrappedAccountKey },
    { Cookie: cookie },
  )
}

async function signInOptions(server: TestServer, cookie?: string) {
  const response = await post(
    server,
    '/api/passkeys/sign-in/options',
    {},
    cookie ? { Cookie: cookie } : {},
  )
  expect(response.status).toBe(200)
  return signInOptionsResponse.parse(await response.json())
}

async function signInWith(server: TestServer, passkey: FakePasskey, cookie?: string) {
  const { challengeId, options } = await signInOptions(server, cookie)
  const response = await passkey.signIn({ challenge: options.challenge })
  return post(
    server,
    '/api/passkeys/sign-in',
    { challengeId, response },
    cookie ? { Cookie: cookie } : {},
  )
}

async function passkeysOf(server: TestServer, cookie: string) {
  return passkeysResponse.parse(await (await get(server, '/api/passkeys', cookie)).json()).passkeys
}

async function signedInAs(server: TestServer, cookie: string) {
  const session = sessionResponse.parse(await (await get(server, '/api/session', cookie)).json())
  return session?.user.username ?? null
}

describe('passkeys', () => {
  let server: TestServer
  let phone: string
  let passkey: FakePasskey

  beforeEach(async () => {
    server = await createTestApp({ trustProxy: true, openSignUp: true })
    phone = await signUp(server, ana)
    passkey = await fakePasskey()
  })

  it('SYS-06: asks for a discoverable passkey that checks who holds the device', async () => {
    const { options } = await registrationFor(server, phone)

    expect(options.rp.id).toBe('localhost')
    expect(options.user.name).toBe('ana')
    expect(options.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      userVerification: 'required',
    })
  })

  it('SYS-06: adds a passkey with the current password and lists it', async () => {
    const response = await addPasskey(server, phone, passkey)

    expect(response.status).toBe(201)
    const listed = await passkeysOf(server, phone)
    expect(listed.map(({ id, lastUsedAt }) => ({ id, lastUsedAt }))).toEqual([
      { id: passkey.id, lastUsedAt: null },
    ])
    // Adding one doesn't sign anyone out.
    expect(await signedInAs(server, phone)).toBe('ana')
  })

  it('SYS-06: refuses to add a passkey without the right password', async () => {
    const response = await addPasskey(server, phone, passkey, {
      loginSecret: base64Url(43, 'a wrong guess'),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'wrong-password' })
    expect(await passkeysOf(server, phone)).toEqual([])
  })

  it('SYS-06: needs a signed-in user to add or list passkeys', async () => {
    expect((await post(server, '/api/passkeys/registration', {})).status).toBe(401)
    expect((await get(server, '/api/passkeys')).status).toBe(401)
  })

  it('SYS-06: refuses a passkey that answers another challenge, site or origin', async () => {
    const wrong = [
      { challenge: base64Url(43, 'not the challenge') },
      { origin: 'https://evil.example' },
      { rpId: 'evil.example' },
    ]

    for (const ceremony of wrong) {
      const { challengeId, options } = await registrationFor(server, phone)
      const response = await passkey.register({ challenge: options.challenge, ...ceremony })
      const result = await post(
        server,
        '/api/passkeys',
        {
          challengeId,
          response,
          loginSecret: ana.loginSecret,
          wrappedAccountKey: anaPasskeyWrapped,
        },
        { Cookie: phone },
      )
      expect(result.status).toBe(401)
      expect(await result.json()).toEqual({ error: 'wrong-passkey' })
    }
    expect(await passkeysOf(server, phone)).toEqual([])
  })

  it('SYS-06: a registration challenge works once, and only for whoever asked for it', async () => {
    const { challengeId, options } = await registrationFor(server, phone)
    const response = await passkey.register({ challenge: options.challenge })
    const bobs = await signUp(server, bob)

    const asBob = await post(
      server,
      '/api/passkeys',
      { challengeId, response, loginSecret: bob.loginSecret, wrappedAccountKey: anaPasskeyWrapped },
      { Cookie: bobs },
    )
    // Bob's try used the challenge up, so Ana's own answer to it is refused too.
    const asAna = await post(
      server,
      '/api/passkeys',
      { challengeId, response, loginSecret: ana.loginSecret, wrappedAccountKey: anaPasskeyWrapped },
      { Cookie: phone },
    )

    expect(asBob.status).toBe(401)
    expect(asAna.status).toBe(401)
    expect(await passkeysOf(server, phone)).toEqual([])
    expect(await passkeysOf(server, bobs)).toEqual([])
  })

  it('SYS-06: refuses a passkey that skipped Face ID, a fingerprint or the PIN', async () => {
    const { challengeId, options } = await registrationFor(server, phone)
    const response = await passkey.register({ challenge: options.challenge, unverified: true })

    const result = await post(
      server,
      '/api/passkeys',
      { challengeId, response, loginSecret: ana.loginSecret, wrappedAccountKey: anaPasskeyWrapped },
      { Cookie: phone },
    )

    expect(result.status).toBe(401)
    expect(await passkeysOf(server, phone)).toEqual([])
  })

  it("SEC-04: refuses a passkey answer that carries the passkey's secret", async () => {
    const { challengeId, options } = await registrationFor(server, phone)
    const response = await passkey.register({ challenge: options.challenge })

    const result = await post(
      server,
      '/api/passkeys',
      {
        challengeId,
        response: {
          ...response,
          clientExtensionResults: { prf: { enabled: true, results: { first: 'c2VjcmV0' } } },
        },
        loginSecret: ana.loginSecret,
        wrappedAccountKey: anaPasskeyWrapped,
      },
      { Cookie: phone },
    )

    expect(result.status).toBe(400)
  })

  it('SYS-06: signs in with a passkey and hands back its wrapped account key', async () => {
    await addPasskey(server, phone, passkey)

    const response = await signInWith(server, passkey)

    expect(response.status).toBe(200)
    expect(passkeySignInResponse.parse(await response.json())).toEqual({
      wrappedAccountKey: anaPasskeyWrapped,
    })
    const laptop = cookieOf(response)
    expect(await signedInAs(server, laptop)).toBe('ana')
    const [listed] = await passkeysOf(server, laptop)
    expect(listed?.lastUsedAt).not.toBeNull()
  })

  it('SEC-12: unlocks with the signed-in user’s own passkeys only', async () => {
    await addPasskey(server, phone, passkey)
    const bobs = await signUp(server, bob)
    const bobPasskey = await fakePasskey()
    await addPasskey(server, bobs, bobPasskey, {
      loginSecret: bob.loginSecret,
      wrappedAccountKey: base64Url(54, 'passkey-wrapped bob'),
    })

    const { options } = await signInOptions(server, phone)
    expect(options.allowCredentials?.map((allowed) => allowed.id)).toEqual([passkey.id])

    const refused = await signInWith(server, bobPasskey, phone)
    expect(refused.status).toBe(401)
    expect(await refused.json()).toEqual({ error: 'wrong-passkey' })
    expect(await signedInAs(server, phone)).toBe('ana')

    const unlocked = await signInWith(server, passkey, phone)
    expect(unlocked.status).toBe(200)
  })

  it('SYS-06: a sign-in challenge works once', async () => {
    await addPasskey(server, phone, passkey)
    const { challengeId, options } = await signInOptions(server)
    const response = await passkey.signIn({ challenge: options.challenge })

    const first = await post(server, '/api/passkeys/sign-in', { challengeId, response })
    const replayed = await post(server, '/api/passkeys/sign-in', { challengeId, response })

    expect(first.status).toBe(200)
    expect(replayed.status).toBe(401)
  })

  it('SYS-06: refuses a copied passkey whose counter goes back', async () => {
    await addPasskey(server, phone, passkey)
    expect((await signInWith(server, passkey)).status).toBe(200)
    expect((await signInWith(server, passkey)).status).toBe(200)

    passkey.rewind()
    const response = await signInWith(server, passkey)

    expect(response.status).toBe(401)
  })

  it('SYS-06: refuses an unknown passkey, an unverified one, and a wrong origin', async () => {
    await addPasskey(server, phone, passkey)
    const stranger = await fakePasskey()
    expect((await signInWith(server, stranger)).status).toBe(401)

    for (const ceremony of [{ unverified: true }, { origin: 'https://evil.example' }]) {
      const { challengeId, options } = await signInOptions(server)
      const response = await passkey.signIn({ challenge: options.challenge, ...ceremony })
      const result = await post(server, '/api/passkeys/sign-in', { challengeId, response })
      expect(result.status).toBe(401)
    }
  })

  it('SYS-06: a removed passkey no longer signs in, and only its owner can remove it', async () => {
    await addPasskey(server, phone, passkey)
    const bobs = await signUp(server, bob)

    expect((await del(server, `/api/passkeys/${passkey.id}`, bobs)).status).toBe(404)
    expect(await passkeysOf(server, phone)).toHaveLength(1)
    expect(await passkeysOf(server, bobs)).toEqual([])

    expect((await del(server, `/api/passkeys/${passkey.id}`, phone)).status).toBe(204)
    expect(await passkeysOf(server, phone)).toEqual([])
    expect((await signInWith(server, passkey)).status).toBe(401)
  })

  it('SYS-06: needs the Origin header to know which site the passkey is for', async () => {
    const response = await server.app.request('/api/passkeys/sign-in/options', {
      method: 'POST',
      headers: { Host: 'localhost', 'Content-Type': 'application/json' },
      body: '{}',
    })

    expect(response.status).toBe(400)
  })
})
