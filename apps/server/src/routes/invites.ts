import {
  type Invite,
  inviteMaxDays,
  type InvitesResponse,
  newInviteRequest,
  type NewInviteResponse,
} from '@repo/api'
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { hashToken, randomToken } from '../auth/secrets.ts'
import { requireUser, type SessionStore, type SessionVariables } from '../auth/sessions.ts'
import { newCode, normalizeCode } from '../settings.ts'
import { type Database, schema } from '../store/db.ts'
import { idParam, jsonBody } from './json-body.ts'

export interface InviteRoutesOptions {
  db: Database
  sessions: SessionStore
  now?: () => number
}

const day = 24 * 60 * 60 * 1000
// Enough for a person's whole history of invites; older ones are only clutter.
const listed = 50

// SYS-13: only the operator may manage the server's invites and people.
export const operatorOnly = createMiddleware<{ Variables: SessionVariables }>(async (c, next) => {
  if (!c.var.operator) return c.json({ error: 'operator-only' }, 403)
  await next()
})

// SYS-13, SYS-21: open sign-up is off, so the operator makes invite links, for one
// person or for many. Only the operator can, and only their own invites are listed
// or ended.
export function inviteRoutes({ db, sessions, now = Date.now }: InviteRoutesOptions) {
  const routes = new Hono<{ Variables: SessionVariables }>()
  routes.use('/invites', requireUser(sessions), operatorOnly)
  routes.use('/invites/*', requireUser(sessions), operatorOnly)

  routes.get('/invites', async (c) => {
    const invites = await db
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.createdBy, c.var.userId))
      .orderBy(desc(schema.invites.createdAt), desc(schema.invites.id))
      .limit(listed)
    const joined =
      invites.length === 0
        ? []
        : await db
            .select({ inviteId: schema.users.inviteId, username: schema.users.username })
            .from(schema.users)
            .where(
              inArray(
                schema.users.inviteId,
                invites.map((invite) => invite.id),
              ),
            )
            .orderBy(asc(schema.users.createdAt), asc(schema.users.id))
    return c.json({
      invites: invites.map((invite) =>
        toInvite(
          invite,
          joined.filter((user) => user.inviteId === invite.id).map((user) => user.username),
        ),
      ),
    } satisfies InvitesResponse)
  })

  // The code is returned this once; the server keeps only its hash.
  routes.post('/invites', jsonBody(newInviteRequest), async (c) => {
    const body = c.req.valid('json')
    const expiresAt = Date.parse(body.expiresAt)
    if (expiresAt <= now() || expiresAt > now() + inviteMaxDays * day) {
      return c.json({ error: 'invalid-request' }, 400)
    }
    const code = newCode()
    const [row] = await db
      .insert(schema.invites)
      .values({
        id: randomToken(),
        codeHash: hashToken(normalizeCode(code)),
        createdBy: c.var.userId,
        expiresAt: new Date(expiresAt),
        maxUses: body.maxUses,
        createdAt: new Date(now()),
      })
      .returning()
    if (!row) throw new Error('The invite was not saved')
    return c.json({ invite: toInvite(row, []), code } satisfies NewInviteResponse, 201)
  })

  // SYS-21: ends a link early. Whoever already joined keeps their account.
  routes.post('/invites/:id/end', idParam, async (c) => {
    const ended = await db
      .update(schema.invites)
      .set({ endedAt: new Date(now()) })
      .where(
        and(
          eq(schema.invites.id, c.req.param('id')),
          eq(schema.invites.createdBy, c.var.userId),
          isNull(schema.invites.endedAt),
        ),
      )
      .returning({ id: schema.invites.id })
    return ended.length > 0 ? c.body(null, 204) : c.notFound()
  })

  return routes
}

function toInvite(row: typeof schema.invites.$inferSelect, joined: string[]): Invite {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    maxUses: row.maxUses,
    useCount: row.useCount,
    joined,
  }
}
