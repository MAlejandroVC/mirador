import { and, eq, gt, lt } from 'drizzle-orm'
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

export const sessionCookie = 'mirador_session'

export interface SignedIn {
  userId: string
  username: string
}

export type SessionVariables = SignedIn

export function sessionStore(db: Database, now: () => number = Date.now) {
  function writeCookie(c: Context, token: string) {
    setCookie(c, sessionCookie, token, {
      path: '/',
      // Never readable by scripts, and never sent with a request another site starts.
      httpOnly: true,
      sameSite: 'Strict',
      secure: isHttps(c),
      maxAge: sessionLifetime / 1000,
    })
  }

  return {
    async start(c: Context, userId: string) {
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
      return { userId: row.userId, username: row.username }
    },

    async end(c: Context) {
      const token = getCookie(c, sessionCookie)
      if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)))
      deleteCookie(c, sessionCookie, { path: '/', secure: isHttps(c) })
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
    await next()
  })
}

// The release image runs behind an HTTPS proxy (Caddy), which says so in this header.
function isHttps(c: Context) {
  return new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https'
}
