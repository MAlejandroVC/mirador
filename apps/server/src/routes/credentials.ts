import {
  type ChangeUsernameError,
  changeUsernameRequest,
  changePasswordRequest,
  type KdfParamsBody,
  replaceRecoveryKeyRequest,
  type SessionError,
  type SignOutOthersResponse,
} from '@repo/api'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { type AttemptLimits, limitAddress, tooManyAttempts } from '../auth/guard.ts'
import { hashSecret, verifySecret } from '../auth/secrets.ts'
import { requireUser, type SessionStore, type SessionVariables } from '../auth/sessions.ts'
import { type Database, schema } from '../store/db.ts'
import { jsonBody } from './json-body.ts'

export interface CredentialRoutesOptions {
  db: Database
  sessions: SessionStore
  limits: AttemptLimits
}

export interface NewPassword {
  loginSecret: string
  kdf: KdfParamsBody
  wrappedAccountKey: string
}

// SEC-07, SEC-08: a new password replaces the old one's login secret, salt and wrapped
// key together, and every session ends: whoever knew the old password, on any device,
// is signed out. The caller starts a new session for the device that asked.
export async function setPassword(
  db: Database,
  userId: string,
  password: NewPassword,
  { removePasskeys = false } = {},
) {
  const loginSecretHash = await hashSecret(password.loginSecret)
  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ loginSecretHash, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
    await tx
      .update(schema.keyMaterial)
      .set({
        kdfAlgorithm: password.kdf.algorithm,
        kdfSalt: password.kdf.salt,
        kdfMemoryKib: password.kdf.memoryKiB,
        kdfIterations: password.kdf.iterations,
        kdfParallelism: password.kdf.parallelism,
        wrappedKeyPassword: password.wrappedAccountKey,
        updatedAt: new Date(),
      })
      .where(eq(schema.keyMaterial.userId, userId))
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId))
    if (removePasskeys) await tx.delete(schema.passkeys).where(eq(schema.passkeys.userId, userId))
  })
}

// SEC-08, SYS-06: checks the current password's login secret like a sign-in, counted
// before checking. Keyed by the user alone: only someone already signed in as them can
// try. Returns the response to refuse with, or null when it is right.
export function passwordCheck({ db, limits }: Pick<CredentialRoutesOptions, 'db' | 'limits'>) {
  return async (c: Context<{ Variables: SessionVariables }>, loginSecret: string) => {
    const key = `password ${c.var.userId}`
    if (limits.perUsername.blocked(key)) return tooManyAttempts(c)
    limits.perUsername.hit(key)
    const [user] = await db
      .select({ loginSecretHash: schema.users.loginSecretHash })
      .from(schema.users)
      .where(eq(schema.users.id, c.var.userId))
    if (!user || !(await verifySecret(loginSecret, user.loginSecretHash))) {
      return c.json({ error: 'wrong-password' } satisfies SessionError, 401)
    }
    limits.perUsername.clear(key)
    return null
  }
}

// SEC-08: changing the password or the recovery key, and signing out other devices,
// while signed in. The first two need the current password too, so a device someone
// left signed in (or a stolen session cookie) isn't enough to take the account over.
export function credentialRoutes({ db, sessions, limits }: CredentialRoutesOptions) {
  const routes = new Hono<{ Variables: SessionVariables }>()
  for (const path of [
    '/accounts/password',
    '/accounts/recovery-key',
    '/accounts/username',
    '/session/others',
  ]) {
    routes.use(path, requireUser(sessions))
  }

  const checkPassword = passwordCheck({ db, limits })

  routes.post(
    '/accounts/password',
    limitAddress(limits),
    jsonBody(changePasswordRequest),
    async (c) => {
      const body = c.req.valid('json')
      const refused = await checkPassword(c, body.loginSecret)
      if (refused) return refused
      await setPassword(db, c.var.userId, {
        loginSecret: body.newLoginSecret,
        kdf: body.kdf,
        wrappedAccountKey: body.wrappedAccountKey,
      })
      await sessions.start(c, c.var.userId)
      return c.body(null, 204)
    },
  )

  routes.post(
    '/accounts/recovery-key',
    limitAddress(limits),
    jsonBody(replaceRecoveryKeyRequest),
    async (c) => {
      const body = c.req.valid('json')
      const refused = await checkPassword(c, body.loginSecret)
      if (refused) return refused
      const recoverySecretHash = await hashSecret(body.recoverySecret)
      await db
        .update(schema.keyMaterial)
        .set({
          recoverySecretHash,
          wrappedKeyRecovery: body.wrappedAccountKey,
          updatedAt: new Date(),
        })
        .where(eq(schema.keyMaterial.userId, c.var.userId))
      return c.body(null, 204)
    },
  )

  // A new username. It needs the password too: whoever renames the account decides what
  // it signs in with. Sessions and passkeys are tied to the account's id, so they all
  // keep working.
  routes.post(
    '/accounts/username',
    limitAddress(limits),
    jsonBody(changeUsernameRequest),
    async (c) => {
      const body = c.req.valid('json')
      const refused = await checkPassword(c, body.loginSecret)
      if (refused) return refused
      try {
        await db
          .update(schema.users)
          .set({ username: body.username, updatedAt: new Date() })
          .where(eq(schema.users.id, c.var.userId))
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
        return c.json({ error: 'username-taken' } satisfies ChangeUsernameError, 409)
      }
      return c.body(null, 204)
    },
  )

  // Without the password: it only signs devices out, which the person can undo by
  // signing in again there.
  routes.delete('/session/others', async (c) => {
    const signedOut = await sessions.endOthers(c, c.var.userId)
    return c.json({ signedOut } satisfies SignOutOthersResponse)
  })

  return routes
}

// PostgreSQL's code for a duplicate in a unique column, wherever the driver puts it.
function isUniqueViolation(error: unknown) {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if ((cause as { code?: unknown }).code === '23505') return true
  }
  return false
}
