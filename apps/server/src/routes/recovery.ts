import {
  recoverRequest,
  recoveryKeyRequest,
  type RecoveryKeyResponse,
  type SessionError,
} from '@repo/api'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { type AttemptLimits, limitAddress, tooManyAttempts, usernameKey } from '../auth/guard.ts'
import { verifyAgainstDecoy, verifySecret } from '../auth/secrets.ts'
import type { SessionStore } from '../auth/sessions.ts'
import { type Database, schema } from '../store/db.ts'
import { setPassword } from './credentials.ts'
import { jsonBody } from './json-body.ts'

export interface RecoveryRoutesOptions {
  db: Database
  sessions: SessionStore
  limits: AttemptLimits
}

// SEC-07: getting back in with the recovery key after forgetting the password. Nobody,
// the person running the server included, can do this without the recovery key, and
// the server never sees it: only the recovery secret derived from it.
export function recoveryRoutes({ db, sessions, limits }: RecoveryRoutesOptions) {
  const routes = new Hono()

  // Checks the recovery secret like a sign-in: limited per address and per username
  // from that address, counted before checking, and an unknown username takes as long
  // and gets the same answer as a wrong recovery key.
  async function check(c: Context, username: string, recoverySecret: string) {
    const key = `recovery ${usernameKey(c, limits, username)}`
    if (limits.perUsername.blocked(key)) return 'blocked' as const
    limits.perUsername.hit(key)
    const [row] = await db
      .select({ material: schema.keyMaterial })
      .from(schema.users)
      .innerJoin(schema.keyMaterial, eq(schema.keyMaterial.userId, schema.users.id))
      .where(eq(schema.users.username, username))
    const valid = row
      ? await verifySecret(recoverySecret, row.material.recoverySecretHash)
      : await verifyAgainstDecoy(recoverySecret)
    if (!row || !valid) return 'wrong' as const
    limits.perUsername.clear(key)
    return row.material
  }

  const refuse = (c: Context, outcome: 'blocked' | 'wrong') =>
    outcome === 'blocked'
      ? tooManyAttempts(c)
      : c.json({ error: 'wrong-recovery-key' } satisfies SessionError, 401)

  routes.post(
    '/accounts/recovery/key',
    limitAddress(limits),
    jsonBody(recoveryKeyRequest),
    async (c) => {
      const { username, recoverySecret } = c.req.valid('json')
      const material = await check(c, username, recoverySecret)
      if (typeof material === 'string') return refuse(c, material)
      return c.json({
        wrappedAccountKey: material.wrappedKeyRecovery,
      } satisfies RecoveryKeyResponse)
    },
  )

  routes.post('/accounts/recovery', limitAddress(limits), jsonBody(recoverRequest), async (c) => {
    const body = c.req.valid('json')
    const material = await check(c, body.username, body.recoverySecret)
    if (typeof material === 'string') return refuse(c, material)

    // Whoever had the old password, on any device, is signed out, and any passkey they
    // added with it stops working (see recoverRequest).
    await setPassword(db, material.userId, body, { removePasskeys: true })
    await sessions.start(c, material.userId)
    return c.body(null, 204)
  })

  return routes
}
