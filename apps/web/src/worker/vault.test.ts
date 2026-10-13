// @vitest-environment node
import { keysResponse, preloginRequest, signUpRequest, type SignUpRequest } from '@repo/api'
import { describe, expect, it } from 'vitest'
import { createApi, type Fetch } from '../lib/api'
import { vaultErrorCode } from './errors'
import { Vault } from './vault'

const password = 'a sunny day in Monterrey'

// A stand-in for the server that keeps what it is sent and records every request, so
// the tests can check what would have left the browser.
function fakeServer() {
  const accounts = new Map<string, SignUpRequest>()
  const sent: string[] = []
  let signedIn: string | null = null
  let tamper: ((keys: { kdf: SignUpRequest['kdf']; wrappedAccountKey: string }) => void) | null =
    null

  const handle = (input: Parameters<Fetch>[0], init?: RequestInit): Response => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const body: unknown = init?.body ? JSON.parse(init.body as string) : undefined
    sent.push(`${path} ${JSON.stringify(body ?? null)}`)
    const json = (value: unknown, status = 200) => Response.json(value, { status })

    switch (path) {
      case '/api/accounts': {
        const account = signUpRequest.parse(body)
        if (accounts.has(account.username)) return json({ error: 'username-taken' }, 409)
        accounts.set(account.username, account)
        signedIn = account.username
        return new Response(null, { status: 201 })
      }
      case '/api/accounts/prelogin': {
        const { username } = preloginRequest.parse(body)
        const account = accounts.get(username)
        if (!account) throw new Error('Not used by these tests')
        return json({ kdf: account.kdf })
      }
      case '/api/auth/sign-in/username': {
        const { username, password: secret } = body as { username: string; password: string }
        if (accounts.get(username)?.loginSecret !== secret) return json({ code: 'INVALID' }, 401)
        signedIn = username
        return json({})
      }
      case '/api/auth/sign-out':
        signedIn = null
        return json({})
      case '/api/keys': {
        const account = signedIn ? accounts.get(signedIn) : undefined
        if (!account) return json({ error: 'signed-out' }, 401)
        const keys = { kdf: account.kdf, wrappedAccountKey: account.wrappedAccountKey.password }
        tamper?.(keys)
        return json(keysResponse.parse(keys))
      }
      default:
        return json({}, 404)
    }
  }

  const fetch: Fetch = (input, init) => Promise.resolve(handle(input, init))

  return {
    api: createApi(fetch),
    accounts,
    sent,
    tamperWithKeys(change: typeof tamper) {
      tamper = change
    },
  }
}

async function failure(action: Promise<unknown>) {
  try {
    await action
  } catch (error) {
    return vaultErrorCode(error)
  }
  throw new Error('Expected the action to fail')
}

describe('vault', () => {
  it('SEC-02: neither the password nor the recovery key ever reaches the server', async () => {
    const server = fakeServer()
    const vault = new Vault(server.api)

    const { recoveryKey } = await vault.signUp({ username: 'ana', password })
    await vault.lock()
    await vault.unlock(password)
    await vault.signOut()
    await new Vault(server.api).signIn('ana', password)

    const everything = server.sent.join('\n')
    expect(everything).toContain('ana')
    expect(everything).not.toContain(password)
    expect(everything).not.toContain(recoveryKey)
    expect(everything).not.toContain(recoveryKey.replaceAll('-', ''))
  })

  it('SEC-07: makes a recovery key at sign-up and stays unlocked', async () => {
    const server = fakeServer()
    const vault = new Vault(server.api)

    const { recoveryKey } = await vault.signUp({ username: 'ana', password })

    expect(recoveryKey).toMatch(/^([0-9A-Z]{4}-){13}[0-9A-Z]{4}$/)
    expect(await vault.status()).toBe('unlocked')
    expect(server.accounts.get('ana')?.wrappedAccountKey.recovery).toBeTruthy()
  })

  it('SEC-12: locking forgets the key, and only the right password unlocks again', async () => {
    const vault = new Vault(fakeServer().api)
    await vault.signUp({ username: 'ana', password })

    await vault.lock()
    expect(await vault.status()).toBe('locked')

    expect(await failure(vault.unlock('not my password'))).toBe('wrong-password')
    expect(await vault.status()).toBe('locked')
    await vault.unlock(password)
    expect(await vault.status()).toBe('unlocked')
  })

  it('SYS-06: signs in on another device with the same username and password', async () => {
    const server = fakeServer()
    await new Vault(server.api).signUp({ username: 'ana', password })

    const phone = new Vault(server.api)
    expect(await failure(phone.signIn('ana', 'a cloudy day'))).toBe('wrong-credentials')
    await phone.signIn('ana', password)

    expect(await phone.status()).toBe('unlocked')
  })

  it('SEC-03: stops before signing in when the server asks for weak key settings', async () => {
    const server = fakeServer()
    await new Vault(server.api).signUp({ username: 'ana', password })
    const account = server.accounts.get('ana')!
    account.kdf = { ...account.kdf, memoryKiB: 8, iterations: 1 }
    server.sent.length = 0

    const phone = new Vault(server.api)

    expect(await failure(phone.signIn('ana', password))).toBe('unsafe-server')
    expect(server.sent.join('\n')).not.toContain('sign-in')
  })

  it('SEC-04: refuses a wrapped key the server altered', async () => {
    const server = fakeServer()
    await new Vault(server.api).signUp({ username: 'ana', password })
    server.tamperWithKeys((keys) => {
      const flipped = keys.wrappedAccountKey[10] === 'A' ? 'B' : 'A'
      keys.wrappedAccountKey =
        keys.wrappedAccountKey.slice(0, 10) + flipped + keys.wrappedAccountKey.slice(11)
    })

    const phone = new Vault(server.api)

    expect(await failure(phone.signIn('ana', password))).toBe('unsafe-server')
    expect(await phone.status()).toBe('locked')
  })

  it('SYS-06: explains a taken username, a closed server, too many attempts and no connection', async () => {
    const server = fakeServer()
    await new Vault(server.api).signUp({ username: 'ana', password })

    expect(await failure(new Vault(server.api).signUp({ username: 'ana', password }))).toBe(
      'username-taken',
    )
    const closed = new Vault(
      createApi(() => Promise.resolve(Response.json({ error: 'sign-up-closed' }, { status: 403 }))),
    )
    expect(await failure(closed.signUp({ username: 'ben', password }))).toBe('sign-up-closed')
    const limited = new Vault(createApi(() => Promise.resolve(new Response(null, { status: 429 }))))
    expect(await failure(limited.signIn('ana', password))).toBe('too-many-attempts')
    const offline = new Vault(createApi(() => Promise.reject(new TypeError('Failed to fetch'))))
    expect(await failure(offline.signIn('ana', password))).toBe('network')
  })
})
