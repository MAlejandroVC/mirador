import { type SessionError, type SessionResponse, signInRequest } from '@repo/api'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { type AttemptLimits, limitAddress, tooManyAttempts } from '../auth/guard.ts'
import { verifyAgainstDecoy, verifySecret } from '../auth/secrets.ts'
import type { SessionStore } from '../auth/sessions.ts'
import { type Database, schema } from '../store/db.ts'
import { jsonBody } from './json-body.ts'

export interface SessionRoutesOptions {
  db: Database
  sessions: SessionStore
  limits: AttemptLimits
}

// SYS-06: signing in and out on a device.
export function sessionRoutes({ db, sessions, limits }: SessionRoutesOptions) {
  const routes = new Hono()

  routes.get('/session', async (c) => {
    const signedIn = await sessions.read(c)
    return c.json(
      (signedIn
        ? { user: { id: signedIn.userId, username: signedIn.username } }
        : null) satisfies SessionResponse,
    )
  })

  // SEC-03: the browser sends the login secret it derived, never the password.
  routes.post('/session', limitAddress(limits), jsonBody(signInRequest), async (c) => {
    const { username, loginSecret } = c.req.valid('json')
    if (limits.perUsername.blocked(username)) return tooManyAttempts(c)

    const [user] = await db
      .select({ id: schema.users.id, loginSecretHash: schema.users.loginSecretHash })
      .from(schema.users)
      .where(eq(schema.users.username, username))
    // An unknown username takes as long and gets the same answer as a wrong secret.
    const valid = user
      ? await verifySecret(loginSecret, user.loginSecretHash)
      : await verifyAgainstDecoy(loginSecret)
    if (!user || !valid) {
      limits.perUsername.hit(username)
      return c.json({ error: 'wrong-credentials' } satisfies SessionError, 401)
    }

    limits.perUsername.clear(username)
    await sessions.start(c, user.id)
    return c.body(null, 204)
  })

  routes.delete('/session', async (c) => {
    await sessions.end(c)
    return c.body(null, 204)
  })

  return routes
}
