import {
  type KdfParamsBody,
  type KeysResponse,
  preloginRequest,
  type PreloginResponse,
  type SignUpError,
  signUpRequest,
  type SignUpStatus,
} from '@repo/api'
import { constantTimeEqual, hashPassword, makeSignature } from 'better-auth/crypto'
import { count, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Auth } from '../auth/auth.ts'
import { requireUser, type SessionVariables } from '../auth/session.ts'
import { normalizeSetupCode } from '../settings.ts'
import { type Database, schema } from '../store/db.ts'
import { jsonBody } from './json-body.ts'

export interface AccountRoutesOptions {
  db: Database
  auth: Auth
  secret: string
  // Shown in the server's log at start while there are no accounts (SYS-13).
  setupCode: string
  openSignUp: boolean
}

// Matches defaultKdfCost in @repo/crypto, so made-up settings for unknown usernames
// look like everyone else's.
const fakeKdfCost = { memoryKiB: 64 * 1024, iterations: 3, parallelism: 1 } as const

export function accountRoutes({ db, auth, secret, setupCode, openSignUp }: AccountRoutesOptions) {
  const routes = new Hono<{ Variables: SessionVariables }>()

  async function signUpMode(): Promise<SignUpStatus['mode']> {
    const [row] = await db.select({ users: count() }).from(schema.users)
    if (!row?.users) return 'setup'
    return openSignUp ? 'open' : 'closed'
  }

  routes.get('/accounts/sign-up', async (c) => {
    return c.json({ mode: await signUpMode() } satisfies SignUpStatus)
  })

  // Creates the account and its key material, and signs it in. The body holds no
  // password and no usable key (SEC-02, SEC-03); see @repo/api.
  routes.post('/accounts', jsonBody(signUpRequest), async (c) => {
    const body = c.req.valid('json')
    const mode = await signUpMode()
    const refuse = (error: SignUpError['error'], status: 403 | 409) =>
      c.json({ error } satisfies SignUpError, status)

    if (mode === 'closed') return refuse('sign-up-closed', 403)
    if (
      mode === 'setup' &&
      !constantTimeEqual(normalizeSetupCode(body.setupCode ?? ''), normalizeSetupCode(setupCode))
    ) {
      return refuse('wrong-setup-code', 403)
    }

    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, body.username))
    if (existing.length > 0) return refuse('username-taken', 409)

    const created = await auth.api.signUpEmail({
      body: {
        username: body.username,
        // Better Auth requires an email; this one is never shown, used or sent to.
        email: `${body.username}@users.invalid`,
        password: body.loginSecret,
        name: '',
      },
      headers: c.req.raw.headers,
      returnHeaders: true,
    })
    const userId = created.response.user.id

    try {
      await db.insert(schema.keyMaterial).values({
        userId,
        kdfAlgorithm: body.kdf.algorithm,
        kdfSalt: body.kdf.salt,
        kdfMemoryKib: body.kdf.memoryKiB,
        kdfIterations: body.kdf.iterations,
        kdfParallelism: body.kdf.parallelism,
        wrappedKeyPassword: body.wrappedAccountKey.password,
        wrappedKeyRecovery: body.wrappedAccountKey.recovery,
        // A slow hash, like the login secret's, though 256 random bits don't need it.
        recoverySecretHash: await hashPassword(body.recoverySecret),
      })
    } catch (error) {
      // An account without key material could never be unlocked.
      await db.delete(schema.users).where(eq(schema.users.id, userId))
      throw error
    }

    const response = c.body(null, 201)
    for (const cookie of created.headers.getSetCookie()) {
      response.headers.append('Set-Cookie', cookie)
    }
    return response
  })

  // Salt and cost for deriving the login secret before signing in. POST so the
  // username stays out of URLs and access logs.
  routes.post('/accounts/prelogin', jsonBody(preloginRequest), async (c) => {
    const { username } = c.req.valid('json')
    const [row] = await db
      .select({ material: schema.keyMaterial })
      .from(schema.users)
      .innerJoin(schema.keyMaterial, eq(schema.keyMaterial.userId, schema.users.id))
      .where(eq(schema.users.username, username))
    // An unknown username gets a salt that is the same on every request, so the answer
    // doesn't tell whether the account exists.
    const kdf = row
      ? kdfOf(row.material)
      : {
          algorithm: 'argon2id' as const,
          salt: Buffer.from(await makeSignature(`prelogin:${username}`, secret), 'base64')
            .subarray(0, 16)
            .toString('base64url'),
          ...fakeKdfCost,
        }
    return c.json({ kdf } satisfies PreloginResponse)
  })

  // SEC-09: only ever the signed-in user's own key material.
  routes.get('/keys', requireUser(auth), async (c) => {
    const [material] = await db
      .select()
      .from(schema.keyMaterial)
      .where(eq(schema.keyMaterial.userId, c.var.userId))
    if (!material) return c.notFound()
    return c.json({
      kdf: kdfOf(material),
      wrappedAccountKey: material.wrappedKeyPassword,
    } satisfies KeysResponse)
  })

  return routes
}

function kdfOf(material: typeof schema.keyMaterial.$inferSelect): KdfParamsBody {
  return {
    algorithm: 'argon2id',
    salt: material.kdfSalt,
    memoryKiB: material.kdfMemoryKib,
    iterations: material.kdfIterations,
    parallelism: material.kdfParallelism,
  }
}
