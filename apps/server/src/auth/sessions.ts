import { and, eq, gt, lt, ne } from 'drizzle-orm'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { type Database, schema } from '../store/db.ts'
import { hashToken, randomToken } from './secrets.ts'

const day = 24 * 60 * 60 * 1000
// SYS-06: signed in on a device until signing out there; each visit, at most once a
// day, pushes the end out again, so only a device left unused this long is signed out.
export const sessionLifetime = 60 * day
const refreshAfter = day

// __Host- makes the browser refuse this cookie unless it is Secure, for this exact
// host and path /, so another site on the same domain (such as a preview) can't set
// it. Browsers treat http://localhost as secure, so development still works.
export const sessionCookie = '__Host-mirador_session'

export interface SignedIn {
  userId: string
  username: string
  // SYS-13: runs this server and can invite people.
  operator: boolean
}

export type SessionVariables = SignedIn

export function sessionStore(db: Database, now: () => number = Date.now) {
  function writeCookie(c: Context, token: string) {
    setCookie(c, sessionCookie, token, {
      path: '/',
      // Never readable by scripts, and never sent with a request another site starts.
      httpOnly: true,
      sameSite: 'Strict',
      secure: true,
      maxAge: sessionLifetime / 1000,
    })
  }

  return {
    async start(c: Context, userId: string) {
      // Signing in again on a device replaces its session rather than adding one.
      const previous = getCookie(c, sessionCookie)
      if (previous) {
        await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(previous)))
      }
      const token = randomToken()
      await db
        .delete(schema.sessions)
        .where(
          and(eq(schema.sessions.userId, userId), lt(schema.sessions.expiresAt, new Date(now()))),
        )
      await db.insert(schema.sessions).values({
        id: hashToken(token),
        userId,
        expiresAt: new Date(now() + sessionLifetime),
      })
      writeCookie(c, token)
    },

    async read(c: Context): Promise<SignedIn | null> {
      const token = getCookie(c, sessionCookie)
      if (!token) return null
      const id = hashToken(token)
      const [row] = await db
        .select({
          userId: schema.users.id,
          username: schema.users.username,
          operator: schema.users.operator,
          expiresAt: schema.sessions.expiresAt,
        })
        .from(schema.sessions)
        .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
        .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date(now()))))
      if (!row) return null
      if (row.expiresAt.getTime() - now() < sessionLifetime - refreshAfter) {
        await db
          .update(schema.sessions)
          .set({ expiresAt: new Date(now() + sessionLifetime) })
          .where(eq(schema.sessions.id, id))
        writeCookie(c, token)
      }
      return { userId: row.userId, username: row.username, operator: row.operator }
    },

    // SEC-08: signs the user out everywhere but this device. Returns how many devices.
    async endOthers(c: Context, userId: string) {
      const token = getCookie(c, sessionCookie)
      if (!token) return 0
      const ended = await db
        .delete(schema.sessions)
        .where(and(eq(schema.sessions.userId, userId), ne(schema.sessions.id, hashToken(token))))
        .returning({ expiresAt: schema.sessions.expiresAt })
      // Sessions that had already expired were no device anyone was using.
      return ended.filter((session) => session.expiresAt.getTime() > now()).length
    },

    async end(c: Context) {
      const token = getCookie(c, sessionCookie)
      if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)))
      deleteCookie(c, sessionCookie, { path: '/', secure: true })
    },
  }
}

export type SessionStore = ReturnType<typeof sessionStore>

// SEC-09: every route that touches a user's data runs behind this, and scopes its
// queries to c.var.userId, never to an id from the request.
export function requireUser(sessions: SessionStore) {
  return createMiddleware<{ Variables: SessionVariables }>(async (c, next) => {
    const signedIn = await sessions.read(c)
    if (!signedIn) return c.json({ error: 'signed-out' }, 401)
    c.set('userId', signedIn.userId)
    c.set('username', signedIn.username)
    c.set('operator', signedIn.operator)
    await next()
  })
}
