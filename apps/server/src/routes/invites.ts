import {
  type Invite,
  inviteLifetimeDays,
  type InvitesResponse,
  type NewInviteResponse,
} from '@repo/api'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { hashToken, randomToken } from '../auth/secrets.ts'
import { requireUser, type SessionStore, type SessionVariables } from '../auth/sessions.ts'
import { newCode, normalizeCode } from '../settings.ts'
import { type Database, schema } from '../store/db.ts'

export interface InviteRoutesOptions {
  db: Database
  sessions: SessionStore
  now?: () => number
}

const day = 24 * 60 * 60 * 1000
// Enough for a person's whole history of invites; older ones are only clutter.
const listed = 50

// SYS-13: open sign-up is off, so the operator invites each person. Only the operator
// can, and only their own invites are listed or withdrawn.
export function inviteRoutes({ db, sessions, now = Date.now }: InviteRoutesOptions) {
  const routes = new Hono<{ Variables: SessionVariables }>()
  const operatorOnly = createMiddleware<{ Variables: SessionVariables }>(async (c, next) => {
    if (!c.var.operator) return c.json({ error: 'operator-only' }, 403)
    await next()
  })
  routes.use('/invites', requireUser(sessions), operatorOnly)
  routes.use('/invites/*', requireUser(sessions), operatorOnly)

  const usedBy = alias(schema.users, 'used_by_user')

  routes.get('/invites', async (c) => {
    const rows = await db
      .select({ invite: schema.invites, usedBy: usedBy.username })
      .from(schema.invites)
      .leftJoin(usedBy, eq(usedBy.id, schema.invites.usedBy))
      .where(eq(schema.invites.createdBy, c.var.userId))
      .orderBy(desc(schema.invites.createdAt), desc(schema.invites.id))
      .limit(listed)
    return c.json({
      invites: rows.map((row) => toInvite(row.invite, row.usedBy)),
    } satisfies InvitesResponse)
  })

  // The code is returned this once; the server keeps only its hash.
  routes.post('/invites', async (c) => {
    const code = newCode()
    const [row] = await db
      .insert(schema.invites)
      .values({
        id: randomToken(),
        codeHash: hashToken(normalizeCode(code)),
        createdBy: c.var.userId,
        expiresAt: new Date(now() + inviteLifetimeDays * day),
        createdAt: new Date(now()),
      })
      .returning()
    if (!row) throw new Error('The invite was not saved')
    return c.json({ invite: toInvite(row, null), code } satisfies NewInviteResponse, 201)
  })

  routes.delete('/invites/:id', async (c) => {
    const deleted = await db
      .delete(schema.invites)
      .where(
        and(
          eq(schema.invites.id, c.req.param('id')),
          eq(schema.invites.createdBy, c.var.userId),
          isNull(schema.invites.usedAt),
        ),
      )
      .returning({ id: schema.invites.id })
    return deleted.length > 0 ? c.body(null, 204) : c.notFound()
  })

  return routes
}

function toInvite(row: typeof schema.invites.$inferSelect, usedBy: string | null): Invite {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    usedAt: row.usedAt?.toISOString() ?? null,
    usedBy: row.usedAt ? usedBy : null,
  }
}
