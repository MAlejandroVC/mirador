import { createMiddleware } from 'hono/factory'
import type { Auth } from './auth.ts'

export interface SessionVariables {
  userId: string
}

// SEC-09: every route that touches a user's data runs behind this, and scopes its
// queries to c.var.userId, never to an id from the request.
export function requireUser(auth: Auth) {
  return createMiddleware<{ Variables: SessionVariables }>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) return c.json({ error: 'signed-out' }, 401)
    c.set('userId', session.user.id)
    await next()
  })
}
