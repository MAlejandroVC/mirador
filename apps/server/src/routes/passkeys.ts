import {
  addPasskeyRequest,
  maxPasskeys,
  type Passkey,
  type PasskeyError,
  type PasskeySignInResponse,
  passkeySignInRequest,
  type PasskeysResponse,
  type RegistrationOptionsResponse,
  type SignInOptionsResponse,
} from '@repo/api'
import { and, asc, count, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { Challenges } from '../auth/challenges.ts'
import { type AttemptLimits, limitAddress } from '../auth/guard.ts'
import { requireUser, type SessionStore, type SessionVariables } from '../auth/sessions.ts'
import {
  registrationOptions,
  relyingParty,
  signInOptions,
  verifyRegistration,
  verifySignIn,
} from '../auth/webauthn.ts'
import { type Database, schema } from '../store/db.ts'
import { passwordCheck } from './credentials.ts'
import { idParam, jsonBody } from './json-body.ts'

export interface PasskeyRoutesOptions {
  db: Database
  sessions: SessionStore
  limits: AttemptLimits
  challenges?: Challenges
}

// SYS-06, SEC-12: passkeys sign in and unlock with Face ID, a fingerprint or the
// device's PIN. Each one carries its own wrapped copy of the account key, made in the
// browser with a secret only that passkey produces; the server checks the passkey's
// signature and hands that wrapped key back, which only the same passkey can open.
export function passkeyRoutes({
  db,
  sessions,
  limits,
  challenges = new Challenges(),
}: PasskeyRoutesOptions) {
  const routes = new Hono<{ Variables: SessionVariables }>()
  const checkPassword = passwordCheck({ db, limits })
  routes.use('/passkeys', requireUser(sessions))
  routes.use('/passkeys/registration', requireUser(sessions))
  routes.on('DELETE', '/passkeys/:id', requireUser(sessions))

  const wrongPasskey = (c: Context) =>
    c.json({ error: 'wrong-passkey' } satisfies PasskeyError, 401)
  // Browsers always send Origin with these requests; without it there's no site to
  // bind the passkey to.
  const noOrigin = (c: Context) => c.json({ error: 'invalid-request' }, 400)

  async function stored(userId: string) {
    return db
      .select()
      .from(schema.passkeys)
      .where(eq(schema.passkeys.userId, userId))
      .orderBy(asc(schema.passkeys.createdAt), asc(schema.passkeys.id))
  }

  routes.get('/passkeys', async (c) => {
    const rows = await stored(c.var.userId)
    return c.json({ passkeys: rows.map(toPasskey) } satisfies PasskeysResponse)
  })

  routes.post('/passkeys/registration', async (c) => {
    const rp = relyingParty(c.req.header('origin'))
    if (!rp) return noOrigin(c)
    const existing = await stored(c.var.userId)
    if (existing.length >= maxPasskeys) {
      return c.json({ error: 'too-many-passkeys' } satisfies PasskeyError, 409)
    }
    const { challenge, options } = await registrationOptions(
      rp,
      { id: c.var.userId, username: c.var.username },
      existing,
    )
    const challengeId = challenges.add({ kind: 'registration', challenge, userId: c.var.userId })
    return c.json({ challengeId, options } satisfies RegistrationOptionsResponse)
  })

  // Adding a passkey needs the current password, like changing it (SEC-08): a device
  // left signed in, or a stolen session cookie, isn't enough to add a way in.
  routes.post('/passkeys', limitAddress(limits), jsonBody(addPasskeyRequest), async (c) => {
    const body = c.req.valid('json')
    const rp = relyingParty(c.req.header('origin'))
    if (!rp) return noOrigin(c)
    const refused = await checkPassword(c, body.loginSecret)
    if (refused) return refused
    const pending = challenges.take(body.challengeId, 'registration')
    if (pending?.userId !== c.var.userId) return wrongPasskey(c)
    const passkey = await verifyRegistration(rp, pending.challenge, body.response)
    if (!passkey) return wrongPasskey(c)

    const added = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ count: count() })
        .from(schema.passkeys)
        .where(eq(schema.passkeys.userId, c.var.userId))
      if ((existing?.count ?? 0) >= maxPasskeys) return 'too-many' as const
      const [row] = await tx
        .insert(schema.passkeys)
        .values({ ...passkey, userId: c.var.userId, wrappedAccountKey: body.wrappedAccountKey })
        .onConflictDoNothing()
        .returning()
      return row ?? null
    })
    if (added === 'too-many') {
      return c.json({ error: 'too-many-passkeys' } satisfies PasskeyError, 409)
    }
    // The same credential id again: already saved, by this user or someone else.
    if (!added) return wrongPasskey(c)
    return c.json(toPasskey(added), 201)
  })

  routes.delete('/passkeys/:id', idParam, async (c) => {
    const removed = await db
      .delete(schema.passkeys)
      .where(
        and(eq(schema.passkeys.id, c.req.param('id')), eq(schema.passkeys.userId, c.var.userId)),
      )
      .returning({ id: schema.passkeys.id })
    if (removed.length === 0) return c.json({ error: 'not-found' }, 404)
    return c.body(null, 204)
  })

  // Signed out, any passkey for this site may answer and says who it belongs to.
  // Signed in with the data locked (SEC-12), only the user's own passkeys may.
  routes.post('/passkeys/sign-in/options', limitAddress(limits), async (c) => {
    const rp = relyingParty(c.req.header('origin'))
    if (!rp) return noOrigin(c)
    const signedIn = await sessions.read(c)
    const allowed = signedIn ? await stored(signedIn.userId) : null
    const { challenge, options } = await signInOptions(rp, allowed)
    const challengeId = challenges.add({
      kind: 'sign-in',
      challenge,
      userId: signedIn?.userId ?? null,
    })
    return c.json({ challengeId, options } satisfies SignInOptionsResponse)
  })

  routes.post(
    '/passkeys/sign-in',
    limitAddress(limits),
    jsonBody(passkeySignInRequest),
    async (c) => {
      const body = c.req.valid('json')
      const rp = relyingParty(c.req.header('origin'))
      if (!rp) return noOrigin(c)
      const pending = challenges.take(body.challengeId, 'sign-in')
      if (!pending) return wrongPasskey(c)
      const [passkey] = await db
        .select()
        .from(schema.passkeys)
        .where(eq(schema.passkeys.id, body.response.id))
      // Unlocking answers only with the signed-in user's passkeys.
      if (!passkey || (pending.userId && passkey.userId !== pending.userId)) {
        return wrongPasskey(c)
      }
      const verified = await verifySignIn(rp, pending.challenge, body.response, passkey)
      if (!verified) return wrongPasskey(c)

      await db
        .update(schema.passkeys)
        .set({ counter: verified.counter, lastUsedAt: new Date() })
        .where(eq(schema.passkeys.id, passkey.id))
      await sessions.start(c, passkey.userId)
      return c.json({
        wrappedAccountKey: passkey.wrappedAccountKey,
      } satisfies PasskeySignInResponse)
    },
  )

  return routes
}

function toPasskey(row: typeof schema.passkeys.$inferSelect): Passkey {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }
}
