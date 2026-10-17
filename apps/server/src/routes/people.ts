import { type PeopleError, type PeopleResponse } from '@repo/api'
import { and, asc, count, eq, gt, isNotNull, isNull, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  removedAccess,
  requireUser,
  type SessionStore,
  type SessionVariables,
} from '../auth/sessions.ts'
import { type Database, schema } from '../store/db.ts'
import { operatorOnly } from './invites.ts'

export interface PeopleRoutesOptions {
  db: Database
  sessions: SessionStore
  now?: () => number
}

// SYS-22: the operator sees who has an account and can remove someone. Removing takes
// away the app at once; the account keeps its data only to download it (SYS-23)
// until the window ends, and the operator can restore it until then.
export function peopleRoutes({ db, sessions, now = Date.now }: PeopleRoutesOptions) {
  const routes = new Hono<{ Variables: SessionVariables }>()
  routes.use('/people', requireUser(sessions), operatorOnly)
  routes.use('/people/*', requireUser(sessions), operatorOnly)

  routes.get('/people', async (c) => {
    const rows = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        operator: schema.users.operator,
        createdAt: schema.users.createdAt,
        removedAt: schema.users.removedAt,
      })
      .from(schema.users)
      .orderBy(asc(schema.users.createdAt), asc(schema.users.id))
    return c.json({
      people: rows.map((row) => ({
        id: row.id,
        username: row.username,
        operator: row.operator,
        joinedAt: row.createdAt.toISOString(),
        deletesAt: row.removedAt
          ? new Date(row.removedAt.getTime() + removedAccess).toISOString()
          : null,
      })),
    } satisfies PeopleResponse)
  })

  routes.post('/people/:id/remove', async (c) => {
    const id = c.req.param('id')
    // Someone has to run the server, so the operator can't remove themselves.
    if (id === c.var.userId) {
      return c.json({ error: 'cannot-remove-operator' } satisfies PeopleError, 403)
    }
    const removed = await db
      .update(schema.users)
      .set({ removedAt: new Date(now()) })
      .where(
        and(
          eq(schema.users.id, id),
          eq(schema.users.operator, false),
          isNull(schema.users.removedAt),
        ),
      )
      .returning({ id: schema.users.id })
    return removed.length > 0 ? c.body(null, 204) : c.notFound()
  })

  routes.post('/people/:id/restore', async (c) => {
    const restored = await db
      .update(schema.users)
      .set({ removedAt: null })
      .where(
        and(
          eq(schema.users.id, c.req.param('id')),
          gt(schema.users.removedAt, new Date(now() - removedAccess)),
        ),
      )
      .returning({ id: schema.users.id })
    return restored.length > 0 ? c.body(null, 204) : c.notFound()
  })

  return routes
}

// SYS-23: deletes every removed account whose window has ended, with everything of
// it (the foreign keys cascade). Says how many went and how many accounts are left.
export async function deleteRemovedAccounts(db: Database, now: number = Date.now()) {
  const deleted = await db
    .delete(schema.users)
    .where(
      and(
        isNotNull(schema.users.removedAt),
        lte(schema.users.removedAt, new Date(now - removedAccess)),
      ),
    )
    .returning({ id: schema.users.id })
  const [row] = await db.select({ users: count() }).from(schema.users)
  return { deleted: deleted.length, remaining: row?.users ?? 0 }
}
