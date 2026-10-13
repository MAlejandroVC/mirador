import { sessionResponse, signUpStatus } from '@repo/api'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import {
  base64Url,
  createTestApp,
  get,
  newAccount,
  post,
  signUp,
  testSetupCode,
  type TestServer,
} from '../test-app.ts'

const ana = newAccount('ana', { setupCode: testSetupCode })
const ben = newAccount('ben')
const bensRecord = `v1.${base64Url(64, 'ben record')}`

async function sessionOf(server: TestServer, cookie: string) {
  return sessionResponse.parse(await (await get(server, '/api/session', cookie)).json())
}

function deleteAccount(server: TestServer, cookie: string | undefined, loginSecret: string) {
  return post(server, '/api/accounts/delete', { loginSecret }, cookie ? { Cookie: cookie } : {})
}

async function dump(server: TestServer) {
  return JSON.stringify(
    await Promise.all(
      ['users', 'sessions', 'key_material', 'records', 'invites', 'passkeys'].map((table) =>
        server.db.execute(sql.raw(`select * from ${table}`)),
      ),
    ),
  )
}

describe('deleting an account', () => {
  let server: TestServer
  let onNoAccounts: Mock<() => void>
  let anasPhone: string
  let bensPhone: string

  beforeEach(async () => {
    onNoAccounts = vi.fn<() => void>()
    server = await createTestApp({ openSignUp: true, onNoAccounts })
    anasPhone = await signUp(server, ana)
    bensPhone = await signUp(server, ben)
    const pushed = await post(
      server,
      '/api/records',
      {
        changes: [
          { id: '0192f1c4-0000-7000-8000-000000000001', baseRevision: 0, ciphertext: bensRecord },
        ],
      },
      { Cookie: bensPhone },
    )
    expect(pushed.status).toBe(200)
  })

  it('SYS-06: needs the current password, not only a signed-in device', async () => {
    const wrong = await deleteAccount(server, bensPhone, base64Url(43, 'guess'))
    const signedOut = await deleteAccount(server, undefined, ben.loginSecret)

    expect(wrong.status).toBe(401)
    expect(await wrong.json()).toEqual({ error: 'wrong-password' })
    expect(signedOut.status).toBe(401)
    expect((await sessionOf(server, bensPhone))?.user.username).toBe('ben')
    expect(await dump(server)).toContain(bensRecord)
  })

  it('SYS-06: deletes everything the server keeps for the account, and nobody else’s', async () => {
    const response = await deleteAccount(server, bensPhone, ben.loginSecret)

    expect(response.status).toBe(204)
    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/)
    expect(await sessionOf(server, bensPhone)).toBeNull()
    const left = await dump(server)
    for (const trace of [
      '"ben"',
      ben.kdf.salt,
      ben.wrappedAccountKey.password,
      ben.wrappedAccountKey.recovery,
      bensRecord,
    ]) {
      expect(left).not.toContain(trace)
    }
    const signIn = await post(server, '/api/session', {
      username: 'ben',
      loginSecret: ben.loginSecret,
    })
    expect(signIn.status).toBe(401)
    // SEC-09: someone else's account is untouched.
    expect((await sessionOf(server, anasPhone))?.user).toMatchObject({
      username: 'ana',
      operator: true,
    })
    expect(left).toContain(ana.wrappedAccountKey.password)
    // The name is free again.
    await signUp(server, newAccount('ben'))
    expect(onNoAccounts).not.toHaveBeenCalled()
  })

  it('SYS-13: the oldest account left runs the server, and after the last one the setup code is needed again', async () => {
    const cleo = await signUp(server, newAccount('cleo'))

    expect((await deleteAccount(server, anasPhone, ana.loginSecret)).status).toBe(204)
    expect((await sessionOf(server, bensPhone))?.user.operator).toBe(true)
    expect((await sessionOf(server, cleo))?.user.operator).toBe(false)

    await deleteAccount(server, bensPhone, ben.loginSecret)
    expect((await sessionOf(server, cleo))?.user.operator).toBe(true)
    expect(onNoAccounts).not.toHaveBeenCalled()

    await deleteAccount(server, cleo, newAccount('cleo').loginSecret)
    expect(onNoAccounts).toHaveBeenCalledOnce()
    const status = signUpStatus.parse(await (await get(server, '/api/accounts/sign-up')).json())
    expect(status.mode).toBe('setup')
    expect((await post(server, '/api/accounts', newAccount('dan'))).status).toBe(403)
    await signUp(server, newAccount('dan', { setupCode: testSetupCode }))
  })
})
