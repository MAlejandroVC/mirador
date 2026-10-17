import {
  deleteAccountRequest,
  type KdfParamsBody,
  type KeysResponse,
  preloginRequest,
  type PreloginResponse,
  type SignUpError,
  signUpRequest,
  type SignUpStatus,
  usernameCheckRequest,
  type UsernameCheckResponse,
} from '@repo/api'
import { and, asc, count, eq, gt, isNull, lt, or, sql, TransactionRollbackError } from 'drizzle-orm'
import { Hono } from 'hono'
import { type AttemptLimits, limitAddress } from '../auth/guard.ts'
import { hashSecret, hashToken, randomToken, sameText, steadyBytes } from '../auth/secrets.ts'
import { requireUser, type SessionStore, type SessionVariables } from '../auth/sessions.ts'
import { normalizeCode } from '../settings.ts'
import { type Database, schema } from '../store/db.ts'
import { passwordCheck } from './credentials.ts'
import { jsonBody } from './json-body.ts'

export interface AccountRoutesOptions {
  db: Database
  sessions: SessionStore
  limits: AttemptLimits
  secret: string
  // Shown in the server's log at start while there are no accounts (SYS-13).
  setupCode: string
  openSignUp: boolean
  // Called when the last account is deleted, so the setup code can be shown again.
  onNoAccounts?: () => void
}

// Matches defaultKdfCost in @repo/crypto, so made-up settings for unknown usernames
// look like everyone else's.
const fakeKdfCost = { memoryKiB: 64 * 1024, iterations: 3, parallelism: 1 } as const

export function accountRoutes({
  db,
  sessions,
  limits,
  secret,
  setupCode,
  openSignUp,
  onNoAccounts = () => undefined,
}: AccountRoutesOptions) {
  const routes = new Hono<{ Variables: SessionVariables }>()

  async function signUpMode(): Promise<SignUpStatus['mode']> {
    const [row] = await db.select({ users: count() }).from(schema.users)
    if (!row?.users) return 'setup'
    return openSignUp ? 'open' : 'invite'
  }

  routes.get('/accounts/sign-up', async (c) => {
    return c.json({ mode: await signUpMode() } satisfies SignUpStatus)
  })

  // Creates the account and its key material, and signs it in. The body holds no
  // password and no usable key (SEC-02, SEC-03); see @repo/api.
  routes.post('/accounts', limitAddress(limits), jsonBody(signUpRequest), async (c) => {
    const body = c.req.valid('json')
    const mode = await signUpMode()
    const refuse = (error: SignUpError['error'], status: 403 | 409) =>
      c.json({ error } satisfies SignUpError, status)

    if (mode === 'invite' && !body.inviteCode) return refuse('wrong-invite', 403)
    if (
      mode === 'setup' &&
      !sameText(normalizeCode(body.setupCode ?? ''), normalizeCode(setupCode))
    ) {
      return refuse('wrong-setup-code', 403)
    }

    const [loginSecretHash, recoverySecretHash] = await Promise.all([
      hashSecret(body.loginSecret),
      hashSecret(body.recoverySecret),
    ])
    const userId = randomToken()
    // All rows or none: an account without key material could never be unlocked, and
    // an invite is used up only by an account that was created.
    const created = await db
      .transaction(async (tx) => {
        const inserted = await tx
          .insert(schema.users)
          // SYS-13: whoever creates the first account runs the server.
          .values({
            id: userId,
            username: body.username,
            loginSecretHash,
            operator: mode === 'setup',
          })
          .onConflictDoNothing({ target: schema.users.username })
          .returning({ id: schema.users.id })
        if (inserted.length === 0) return 'username-taken' as const
        if (mode === 'invite') {
          // Counted in one statement, so two sign-ups can't both take a link's last use.
          const [claimed] = await tx
            .update(schema.invites)
            .set({ useCount: sql`${schema.invites.useCount} + 1` })
            .where(openInvite(body.inviteCode))
            .returning({ id: schema.invites.id })
          if (!claimed) tx.rollback()
          else {
            await tx
              .update(schema.users)
              .set({ inviteId: claimed.id })
              .where(eq(schema.users.id, userId))
          }
        }
        await tx.insert(schema.keyMaterial).values({
          userId,
          kdfAlgorithm: body.kdf.algorithm,
          kdfSalt: body.kdf.salt,
          kdfMemoryKib: body.kdf.memoryKiB,
          kdfIterations: body.kdf.iterations,
          kdfParallelism: body.kdf.parallelism,
          wrappedKeyPassword: body.wrappedAccountKey.password,
          wrappedKeyRecovery: body.wrappedAccountKey.recovery,
          recoverySecretHash,
        })
        return 'created' as const
      })
      .catch((error: unknown) => {
        if (error instanceof TransactionRollbackError) return 'wrong-invite' as const
        throw error
      })
    if (created === 'username-taken') return refuse('username-taken', 409)
    if (created === 'wrong-invite') return refuse('wrong-invite', 403)

    await sessions.start(c, userId)
    return c.body(null, 201)
  })

  // Lets the sign-up screen say a username is taken before the keys are made. It tells
  // no more than signing up would: with open sign-up anyone could try the name, and on
  // an invite-only server it needs an invite code that still works. Counted per
  // address like sign-ups.
  routes.post(
    '/accounts/username-check',
    limitAddress(limits),
    jsonBody(usernameCheckRequest),
    async (c) => {
      const body = c.req.valid('json')
      if ((await signUpMode()) === 'invite') {
        const [invite] = await db
          .select({ id: schema.invites.id })
          .from(schema.invites)
          .where(openInvite(body.inviteCode))
        if (!invite) return c.json({ error: 'wrong-invite' } satisfies SignUpError, 403)
      }
      const [taken] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.username, body.username))
      return c.json({ available: !taken } satisfies UsernameCheckResponse)
    },
  )

  // Salt and cost for deriving the login secret before signing in. POST so the
  // username stays out of URLs and access logs.
  routes.post('/accounts/prelogin', limitAddress(limits), jsonBody(preloginRequest), async (c) => {
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
          salt: steadyBytes(secret, `prelogin:${username}`, 16).toString('base64url'),
          ...fakeKdfCost,
        }
    return c.json({ kdf } satisfies PreloginResponse)
  })

  // Deletes the account for good: its key material, records, sessions, passkeys and
  // invites go with it (the foreign keys cascade), so nothing of it is left but the
  // backups made before. Needs the current password, so a device left signed in isn't
  // enough.
  const checkPassword = passwordCheck({ db, limits })
  // SYS-23: a removed account may delete itself before its window ends.
  routes.post(
    '/accounts/delete',
    requireUser(sessions, { allowRemoved: true }),
    limitAddress(limits),
    jsonBody(deleteAccountRequest),
    async (c) => {
      const refused = await checkPassword(c, c.req.valid('json').loginSecret)
      if (refused) return refused
      const remaining = await db.transaction(async (tx) => {
        const [deleted] = await tx
          .delete(schema.users)
          .where(eq(schema.users.id, c.var.userId))
          .returning({ operator: schema.users.operator })
        // SYS-13: someone has to run the server: the oldest account left takes over,
        // never one that was removed (SYS-22).
        if (deleted?.operator) {
          const [oldest] = await tx
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(isNull(schema.users.removedAt))
            .orderBy(asc(schema.users.createdAt), asc(schema.users.id))
            .limit(1)
          if (oldest) {
            await tx
              .update(schema.users)
              .set({ operator: true })
              .where(eq(schema.users.id, oldest.id))
          }
        }
        const [row] = await tx.select({ users: count() }).from(schema.users)
        return row?.users ?? 0
      })
      await sessions.end(c)
      // The server is new again: the next account needs the setup code (SYS-13).
      if (remaining === 0) onNoAccounts()
      return c.body(null, 204)
    },
  )

  // SEC-09: only ever the signed-in user's own key material.
  // SYS-23: a removed account still unlocks, to download its data.
  routes.get('/keys', requireUser(sessions, { allowRemoved: true }), async (c) => {
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

// SYS-21: an invite link still signs people up until it expires, is used up or is
// ended early.
function openInvite(code: string | undefined) {
  return and(
    eq(schema.invites.codeHash, hashToken(normalizeCode(code ?? ''))),
    isNull(schema.invites.endedAt),
    gt(schema.invites.expiresAt, new Date()),
    or(isNull(schema.invites.maxUses), lt(schema.invites.useCount, schema.invites.maxUses)),
  )
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
