import { PGlite } from '@electric-sql/pglite'
import type { SignUpRequest } from '@repo/api'
import { sql } from 'drizzle-orm'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { type AppOptions, createApp } from './app.ts'
import { migrationsFolder, schema } from './store/db.ts'

export const testSetupCode = 'TEST-SETU-PCOD-E123-4567'
// Browsers always send these on a request that changes something.
export const testHost = 'localhost'
export const testOrigin = 'http://localhost'

let shared: PgliteDatabase<typeof schema> | undefined

// A server on an in-memory PostgreSQL (PGlite) with the real migrations. Starting
// PGlite takes a second or two, so each test file keeps one and every call starts
// from empty tables: one test server at a time per file.
export async function createTestApp(options: Partial<AppOptions> = {}) {
  if (!shared) {
    shared = drizzle({ client: new PGlite(), schema })
    await migrate(shared, { migrationsFolder })
  }
  const db = shared
  await db.execute(
    sql.raw(
      'truncate users, sessions, key_material, records, invites, passkeys, server_settings cascade',
    ),
  )
  const app = createApp({
    db,
    secret: 'a-test-secret',
    setupCode: () => testSetupCode,
    ...options,
  })
  return { app, db }
}

export type TestServer = Awaited<ReturnType<typeof createTestApp>>

// Stand-ins for what the browser sends: the server can't tell them from real key
// material, which is the point. Real values come from @repo/crypto in the web app.
export function base64Url(length: number, seed: string) {
  return Buffer.from(seed.repeat(length))
    .toString('base64url')
    .replace(/[^A-Za-z0-9_-]/g, 'x')
    .slice(0, length)
}

export function newAccount(username: string, extra: Partial<SignUpRequest> = {}): SignUpRequest {
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

export function post(
  server: TestServer,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return server.app.request(path, {
    method: 'POST',
    headers: {
      Host: testHost,
      'Content-Type': 'application/json',
      Origin: testOrigin,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

export function get(server: TestServer, path: string, cookie?: string) {
  return server.app.request(path, {
    headers: { Host: testHost, ...(cookie ? { Cookie: cookie } : {}) },
  })
}

export function del(server: TestServer, path: string, cookie?: string) {
  return server.app.request(path, {
    method: 'DELETE',
    headers: { Host: testHost, Origin: testOrigin, ...(cookie ? { Cookie: cookie } : {}) },
  })
}

export function cookieOf(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

export async function signUp(server: TestServer, account: SignUpRequest) {
  const response = await post(server, '/api/accounts', account)
  if (response.status !== 201) throw new Error(`Sign-up failed with ${response.status}`)
  return cookieOf(response)
}
