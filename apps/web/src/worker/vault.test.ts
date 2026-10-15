// @vitest-environment node
import {
  addPasskeyRequest,
  changePasswordRequest,
  changeUsernameRequest,
  deleteAccountRequest,
  passkeySignInRequest,
  keysResponse,
  preloginRequest,
  pushRequest,
  recoverRequest,
  recoveryKeyRequest,
  replaceRecoveryKeyRequest,
  signInRequest,
  signUpRequest,
  type SignUpRequest,
} from '@repo/api'
import { describe, expect, it } from 'vitest'
import { newRecordId } from '@repo/crypto'
import { createApi, type Fetch } from '../lib/api'
import { vaultErrorCode } from './errors'
import { Vault } from './vault'

const password = 'a sunny day in Monterrey'

// A stand-in for the server that keeps what it is sent and records every request, so
// the tests can check what would have left the browser.
function fakeServer() {
  const accounts = new Map<string, SignUpRequest>()
  // Per user, like apps/server/src/routes/records.ts (without conflict checks).
  const records = new Map<string, { id: string; revision: number; ciphertext: string }[]>()
  const sent: string[] = []
  // Like the server's user ids: they stay the same when the username changes.
  const ids = new Map<string, string>()
  // SYS-06: what the server keeps per passkey: whose it is and the key it wrapped.
  const passkeys = new Map<string, { username: string; wrappedAccountKey: string }>()
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
      case '/api/session': {
        if (!init?.method || init.method === 'GET') {
          return json(
            signedIn
              ? {
                  user: {
                    id: ids.get(signedIn) ?? `id-${signedIn}`,
                    username: signedIn,
                    operator: false,
                  },
                }
              : null,
          )
        }
        if (init.method === 'DELETE') {
          signedIn = null
          return new Response(null, { status: 204 })
        }
        const { username, loginSecret } = signInRequest.parse(body)
        if (accounts.get(username)?.loginSecret !== loginSecret) {
          return json({ error: 'wrong-credentials' }, 401)
        }
        signedIn = username
        return new Response(null, { status: 204 })
      }
      case '/api/keys': {
        const account = signedIn ? accounts.get(signedIn) : undefined
        if (!account) return json({ error: 'signed-out' }, 401)
        const keys = { kdf: account.kdf, wrappedAccountKey: account.wrappedAccountKey.password }
        tamper?.(keys)
        return json(keysResponse.parse(keys))
      }
      case '/api/accounts/recovery/key': {
        const { username, recoverySecret } = recoveryKeyRequest.parse(body)
        const account = accounts.get(username)
        if (account?.recoverySecret !== recoverySecret) {
          return json({ error: 'wrong-recovery-key' }, 401)
        }
        return json({ wrappedAccountKey: account.wrappedAccountKey.recovery })
      }
      case '/api/accounts/recovery': {
        const request = recoverRequest.parse(body)
        const account = accounts.get(request.username)
        if (account?.recoverySecret !== request.recoverySecret) {
          return json({ error: 'wrong-recovery-key' }, 401)
        }
        account.loginSecret = request.loginSecret
        account.kdf = request.kdf
        account.wrappedAccountKey.password = request.wrappedAccountKey
        signedIn = request.username
        return new Response(null, { status: 204 })
      }
      case '/api/accounts/password': {
        const request = changePasswordRequest.parse(body)
        const account = signedIn ? accounts.get(signedIn) : undefined
        if (!account) return json({ error: 'signed-out' }, 401)
        if (account.loginSecret !== request.loginSecret) {
          return json({ error: 'wrong-password' }, 401)
        }
        account.loginSecret = request.newLoginSecret
        account.kdf = request.kdf
        account.wrappedAccountKey.password = request.wrappedAccountKey
        return new Response(null, { status: 204 })
      }
      case '/api/accounts/recovery-key': {
        const request = replaceRecoveryKeyRequest.parse(body)
        const account = signedIn ? accounts.get(signedIn) : undefined
        if (!account) return json({ error: 'signed-out' }, 401)
        if (account.loginSecret !== request.loginSecret) {
          return json({ error: 'wrong-password' }, 401)
        }
        account.recoverySecret = request.recoverySecret
        account.wrappedAccountKey.recovery = request.wrappedAccountKey
        return new Response(null, { status: 204 })
      }
      case '/api/accounts/username': {
        const request = changeUsernameRequest.parse(body)
        const account = signedIn ? accounts.get(signedIn) : undefined
        if (!signedIn || !account) return json({ error: 'signed-out' }, 401)
        if (account.loginSecret !== request.loginSecret) {
          return json({ error: 'wrong-password' }, 401)
        }
        if (accounts.has(request.username)) return json({ error: 'username-taken' }, 409)
        accounts.delete(signedIn)
        accounts.set(request.username, { ...account, username: request.username })
        ids.set(request.username, ids.get(signedIn) ?? `id-${signedIn}`)
        records.set(request.username, records.get(signedIn) ?? [])
        records.delete(signedIn)
        signedIn = request.username
        return new Response(null, { status: 204 })
      }
      case '/api/accounts/delete': {
        const request = deleteAccountRequest.parse(body)
        const account = signedIn ? accounts.get(signedIn) : undefined
        if (!signedIn || !account) return json({ error: 'signed-out' }, 401)
        if (account.loginSecret !== request.loginSecret) {
          return json({ error: 'wrong-password' }, 401)
        }
        accounts.delete(signedIn)
        records.delete(signedIn)
        signedIn = null
        return new Response(null, { status: 204 })
      }
      case '/api/passkeys/registration':
        return json({ challengeId: 'registration', options: passkeyOptions })
      case '/api/passkeys': {
        const request = addPasskeyRequest.parse(body)
        const account = signedIn ? accounts.get(signedIn) : undefined
        if (!signedIn || !account) return json({ error: 'signed-out' }, 401)
        if (account.loginSecret !== request.loginSecret) {
          return json({ error: 'wrong-password' }, 401)
        }
        passkeys.set(request.response.id, {
          username: signedIn,
          wrappedAccountKey: request.wrappedAccountKey,
        })
        return json(
          { id: request.response.id, createdAt: new Date().toISOString(), lastUsedAt: null },
          201,
        )
      }
      case '/api/passkeys/sign-in/options':
        return json({ challengeId: 'sign-in', options: { challenge: 'AAAA' } })
      case '/api/passkeys/sign-in': {
        const { response } = passkeySignInRequest.parse(body)
        const passkey = passkeys.get(response.id)
        if (!passkey) return json({ error: 'wrong-passkey' }, 401)
        signedIn = passkey.username
        return json({ wrappedAccountKey: passkey.wrappedAccountKey })
      }
      case '/api/records': {
        if (!signedIn) return json({ error: 'signed-out' }, 401)
        const mine = records.get(signedIn) ?? []
        records.set(signedIn, mine)
        const { changes } = pushRequest.parse(body)
        const revisions: Record<string, number> = {}
        for (const change of changes) {
          const revision = mine.length + 1
          mine.push({ id: change.id, revision, ciphertext: change.ciphertext })
          revisions[change.id] = revision
        }
        return json({ revisions })
      }
      default: {
        const after = /^\/api\/records\?after=(\d+)$/.exec(path)?.[1]
        if (after !== undefined && signedIn) {
          const latest = new Map((records.get(signedIn) ?? []).map((row) => [row.id, row]))
          const changes = [...latest.values()].filter((row) => row.revision > Number(after))
          return json({ changes, more: false })
        }
        return json({}, 404)
      }
    }
  }

  const fetch: Fetch = (input, init) => Promise.resolve(handle(input, init))

  return {
    api: createApi(fetch),
    accounts,
    passkeys,
    sent,
    tamperWithKeys(change: typeof tamper) {
      tamper = change
    },
  }
}

const passkeyOptions = {
  challenge: 'AAAA',
  rp: { id: 'localhost', name: 'Mirador' },
  user: { id: 'MQ', name: 'ana', displayName: 'ana' },
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
}

// What the page brings back from the device (SYS-06): the passkey's answer, which the
// server checks (not this fake), and the PRF secret only that passkey produces.
function fakePasskey(id: string, seed: number) {
  const prf = () => new Uint8Array(32).fill(seed)
  const base = { id, rawId: id, type: 'public-key' as const, clientExtensionResults: {} }
  return {
    secret: Buffer.from(prf()).toString('base64url'),
    made: (challengeId = 'registration') => ({
      challengeId,
      prfOutput: prf(),
      response: { ...base, response: { clientDataJSON: 'e30', attestationObject: 'oA' } },
    }),
    used: (challengeId = 'sign-in') => ({
      challengeId,
      prfOutput: prf(),
      response: {
        ...base,
        response: { clientDataJSON: 'e30', authenticatorData: 'AA', signature: 'AA' },
      },
    }),
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

  it('SYS-18: the profile picture reaches the server only encrypted', async () => {
    const server = fakeServer()
    const phone = new Vault(server.api)
    await phone.signUp({ username: 'ana', password })

    await phone.saveRecords([
      {
        id: newRecordId(),
        body: { deleted: false, type: 'profile', schema: 1, data: { picture: 'butterfly' } },
      },
    ])

    const everything = server.sent.join('\n')
    expect(everything).not.toContain('butterfly')
    expect(everything).not.toContain('profile')
  })

  it('SEC-01: records are encrypted before they leave, and only the owner reads them', async () => {
    const server = fakeServer()
    const phone = new Vault(server.api)
    await phone.signUp({ username: 'ana', password })
    const id = newRecordId()

    await phone.saveRecords([
      { id, body: { deleted: false, type: 'note', schema: 1, data: { text: 'Casa Azul rent' } } },
    ])

    expect(server.sent.join('\n')).not.toContain('Casa Azul')
    const laptop = new Vault(server.api)
    await laptop.signIn('ana', password)
    expect((await laptop.listRecords()).map((record) => record.body)).toEqual([
      { deleted: false, type: 'note', schema: 1, data: { text: 'Casa Azul rent' } },
    ])
    await laptop.lock()
    expect(await failure(laptop.listRecords())).toBe('locked')
  })

  it('SEC-07: makes a recovery key at sign-up and stays unlocked', async () => {
    const server = fakeServer()
    const vault = new Vault(server.api)

    const { recoveryKey } = await vault.signUp({ username: 'ana', password })

    expect(recoveryKey).toMatch(/^([0-9A-Z]{4}-){13}[0-9A-Z]{4}$/)
    expect(await vault.status()).toBe('unlocked')
    expect(server.accounts.get('ana')?.wrappedAccountKey.recovery).toBeTruthy()
  })

  it('SEC-07: the recovery key sets a new password and keeps the data readable', async () => {
    const server = fakeServer()
    const phone = new Vault(server.api)
    const { recoveryKey } = await phone.signUp({ username: 'ana', password })
    const id = newRecordId()
    await phone.saveRecords([
      { id, body: { deleted: false, type: 'note', schema: 1, data: { text: 'kept' } } },
    ])
    await phone.signOut()
    server.sent.length = 0

    const laptop = new Vault(server.api)
    // Typed in lower case without dashes, as people do.
    await laptop.recover({
      username: 'Ana',
      recoveryKey: recoveryKey.replaceAll('-', '').toLowerCase(),
      newPassword: 'a brand new password',
    })

    expect((await laptop.listRecords()).map((record) => record.id)).toEqual([id])
    expect(server.sent.join('\n')).not.toContain(recoveryKey.replaceAll('-', ''))
    expect(server.sent.join('\n')).not.toContain('a brand new password')
    expect(await failure(new Vault(server.api).signIn('ana', password))).toBe('wrong-credentials')
    await new Vault(server.api).signIn('ana', 'a brand new password')
  })

  it('SEC-07: tells a typo from a wrong recovery key', async () => {
    const server = fakeServer()
    const { recoveryKey } = await new Vault(server.api).signUp({ username: 'ana', password })
    const typo = (recoveryKey.startsWith('A') ? 'B' : 'A') + recoveryKey.slice(1)
    const other = (await new Vault(fakeServer().api).signUp({ username: 'ana', password }))
      .recoveryKey

    const vault = new Vault(server.api)
    const attempt = (key: string) =>
      failure(vault.recover({ username: 'ana', recoveryKey: key, newPassword: 'new password!' }))
    expect(await attempt(typo)).toBe('recovery-key-typo')
    expect(await attempt(other)).toBe('wrong-recovery-key')
  })

  it('SEC-08: a new password keeps the data, and neither password leaves the browser', async () => {
    const server = fakeServer()
    const phone = new Vault(server.api)
    await phone.signUp({ username: 'ana', password })
    const id = newRecordId()
    await phone.saveRecords([
      { id, body: { deleted: false, type: 'note', schema: 1, data: { text: 'kept' } } },
    ])
    server.sent.length = 0

    await phone.changePassword(password, 'a brand new password')

    expect(await phone.status()).toBe('unlocked')
    expect(server.sent.join('\n')).not.toContain(password)
    expect(server.sent.join('\n')).not.toContain('a brand new password')
    expect(await failure(new Vault(server.api).signIn('ana', password))).toBe('wrong-credentials')
    const laptop = new Vault(server.api)
    await laptop.signIn('ana', 'a brand new password')
    expect((await laptop.listRecords()).map((record) => record.id)).toEqual([id])
  })

  it('SEC-08: a wrong current password is caught before anything is sent', async () => {
    const server = fakeServer()
    const vault = new Vault(server.api)
    await vault.signUp({ username: 'ana', password })
    server.sent.length = 0

    expect(await failure(vault.changePassword('not my password', 'a brand new password'))).toBe(
      'wrong-password',
    )
    expect(await failure(vault.replaceRecoveryKey('not my password'))).toBe('wrong-password')
    expect(server.sent.join('\n')).not.toContain('/api/accounts/')
    await vault.lock()
    expect(await failure(vault.changePassword(password, 'a brand new password'))).toBe('locked')
  })

  it('SEC-08: a new recovery key opens the data and the old one no longer does', async () => {
    const server = fakeServer()
    const phone = new Vault(server.api)
    const { recoveryKey: old } = await phone.signUp({ username: 'ana', password })
    server.sent.length = 0

    const { recoveryKey } = await phone.replaceRecoveryKey(password)

    expect(recoveryKey).not.toBe(old)
    expect(server.sent.join('\n')).not.toContain(recoveryKey.replaceAll('-', ''))
    expect(server.sent.join('\n')).not.toContain(password)
    await phone.signOut()
    const laptop = new Vault(server.api)
    const recover = (key: string) =>
      laptop.recover({ username: 'ana', recoveryKey: key, newPassword: 'a brand new password' })
    expect(await failure(recover(old))).toBe('wrong-recovery-key')
    await recover(recoveryKey)
    expect(await laptop.status()).toBe('unlocked')
  })

  it('SYS-06: a new username signs in to the same data, with the same password', async () => {
    const server = fakeServer()
    const phone = new Vault(server.api)
    await phone.signUp({ username: 'ana', password })
    await new Vault(server.api).signUp({ username: 'ben', password })
    await phone.signIn('ana', password)
    const id = newRecordId()
    await phone.saveRecords([
      { id, body: { deleted: false, type: 'note', schema: 1, data: { text: 'kept' } } },
    ])
    server.sent.length = 0

    expect(await failure(phone.changeUsername('Ana Maria', 'not my password'))).toBe(
      'wrong-password',
    )
    expect(server.sent.join('\n')).not.toContain('/api/accounts/')
    expect(await failure(phone.changeUsername('ben', password))).toBe('username-taken')
    await phone.changeUsername(' Ana.Maria ', password)

    expect(await phone.status()).toBe('unlocked')
    expect(server.sent.join('\n')).toContain('"username":"ana.maria"')
    expect(server.sent.join('\n')).not.toContain(password)
    const laptop = new Vault(server.api)
    await laptop.signIn('ana.maria', password)
    expect((await laptop.listRecords()).map((record) => record.id)).toEqual([id])
  })

  it('SYS-06: deleting the account needs the password, which never leaves the browser', async () => {
    const server = fakeServer()
    const vault = new Vault(server.api)
    await vault.signUp({ username: 'ana', password })
    server.sent.length = 0

    expect(await failure(vault.deleteAccount('not my password'))).toBe('wrong-password')
    expect(server.sent.join('\n')).not.toContain('/api/accounts/')
    expect(server.accounts.has('ana')).toBe(true)

    await vault.deleteAccount(password)

    expect(server.accounts.has('ana')).toBe(false)
    expect(await vault.status()).toBe('locked')
    expect(server.sent.join('\n')).not.toContain(password)
    expect(await failure(vault.listRecords())).toBe('locked')
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

  it('SYS-06: a passkey signs in on another device and opens the same data', async () => {
    const server = fakeServer()
    const phone = new Vault(server.api)
    await phone.signUp({ username: 'ana', password })
    const id = newRecordId()
    await phone.saveRecords([
      { id, body: { deleted: false, type: 'note', schema: 1, data: { text: 'kept' } } },
    ])
    const faceId = fakePasskey('face-id', 7)
    server.sent.length = 0

    await phone.startAddingPasskey(password)
    await phone.addPasskey(faceId.made())

    const laptop = new Vault(server.api)
    await laptop.openWithPasskey(faceId.used())
    expect((await laptop.listRecords()).map((record) => record.id)).toEqual([id])
    // SEC-02: the server got the wrapped key, never the passkey's secret or the password.
    const everything = server.sent.join('\n')
    expect(everything).toContain('/api/passkeys')
    expect(everything).not.toContain(faceId.secret)
    expect(everything).not.toContain(password)
  })

  it('SEC-12: a passkey unlocks after locking, and only the right one', async () => {
    const server = fakeServer()
    const vault = new Vault(server.api)
    await vault.signUp({ username: 'ana', password })
    const faceId = fakePasskey('face-id', 7)
    await vault.startAddingPasskey(password)
    await vault.addPasskey(faceId.made())

    await vault.lock()
    expect(await failure(vault.openWithPasskey(fakePasskey('stranger', 9).used()))).toBe(
      'wrong-passkey',
    )
    expect(await vault.status()).toBe('locked')
    await vault.openWithPasskey(faceId.used())
    expect(await vault.status()).toBe('unlocked')
  })

  it('SYS-06: a wrong password is caught before the device makes a passkey', async () => {
    const server = fakeServer()
    const vault = new Vault(server.api)
    await vault.signUp({ username: 'ana', password })
    server.sent.length = 0

    expect(await failure(vault.startAddingPasskey('not my password'))).toBe('wrong-password')
    expect(server.sent.join('\n')).not.toContain('/api/passkeys')
    // Without a checked password first, nothing is added.
    expect(await failure(vault.addPasskey(fakePasskey('face-id', 7).made()))).toBe('unknown')
    // Locking in between forgets the checked password.
    await vault.startAddingPasskey(password)
    await vault.lock()
    await vault.unlock(password)
    expect(await failure(vault.addPasskey(fakePasskey('face-id', 7).made()))).toBe('unknown')
    expect(server.passkeys.size).toBe(0)
  })

  it('SEC-04: refuses a passkey-wrapped key the server altered', async () => {
    const server = fakeServer()
    const vault = new Vault(server.api)
    await vault.signUp({ username: 'ana', password })
    const faceId = fakePasskey('face-id', 7)
    await vault.startAddingPasskey(password)
    await vault.addPasskey(faceId.made())
    const stored = server.passkeys.get('face-id')!
    stored.wrappedAccountKey = server.accounts.get('ana')!.wrappedAccountKey.recovery

    await vault.lock()
    expect(await failure(vault.openWithPasskey(faceId.used()))).toBe('unsafe-server')
    expect(await vault.status()).toBe('locked')
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
    expect(server.sent.join('\n')).not.toContain('/api/session')
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

  it('SYS-06: explains a taken username, a wrong invite, too many attempts and no connection', async () => {
    const server = fakeServer()
    await new Vault(server.api).signUp({ username: 'ana', password })

    expect(await failure(new Vault(server.api).signUp({ username: 'ana', password }))).toBe(
      'username-taken',
    )
    const uninvited = new Vault(
      createApi(() => Promise.resolve(Response.json({ error: 'wrong-invite' }, { status: 403 }))),
    )
    expect(
      await failure(uninvited.signUp({ username: 'ben', password, inviteCode: 'USED-CODE' })),
    ).toBe('wrong-invite')
    const limited = new Vault(createApi(() => Promise.resolve(new Response(null, { status: 429 }))))
    expect(await failure(limited.signIn('ana', password))).toBe('too-many-attempts')
    const offline = new Vault(createApi(() => Promise.reject(new TypeError('Failed to fetch'))))
    expect(await failure(offline.signIn('ana', password))).toBe('network')
  })
})
