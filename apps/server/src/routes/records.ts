import {
  maxPullChanges,
  type PullResponse,
  type PushConflict,
  pushRequest,
  type PushResponse,
  revision,
} from '@repo/api'
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { requireUser, type SessionStore, type SessionVariables } from '../auth/sessions.ts'
import { type Database, schema } from '../store/db.ts'
import { jsonBody } from './json-body.ts'

export interface RecordRoutesOptions {
  db: Database
  sessions: SessionStore
}

class Conflict extends Error {
  constructor(readonly ids: string[]) {
    super('conflict')
  }
}

// Stores and hands out a user's encrypted records (SEC-01). The server can't read
// them, so it only orders them, checks no device overwrites a change it hasn't seen,
// and keeps each user to their own rows (SEC-09).
export function recordRoutes({ db, sessions }: RecordRoutesOptions) {
  const routes = new Hono<{ Variables: SessionVariables }>()
  // SYS-23: a removed account can still pull its records to download them, but can't
  // change them.
  routes.on('GET', '/records', requireUser(sessions, { allowRemoved: true }))
  routes.on('POST', '/records', requireUser(sessions))

  routes.post('/records', jsonBody(pushRequest), async (c) => {
    const { changes } = c.req.valid('json')
    const userId = c.var.userId
    const ids = changes.map((change) => change.id)
    if (new Set(ids).size !== ids.length) return c.json({ error: 'invalid-request' }, 400)

    try {
      // NFR-08: the whole batch or nothing.
      const revisions = await db.transaction(async (tx) => {
        // One push at a time per user, so revisions stay in the order they were given.
        const [user] = await tx
          .select({ last: schema.users.recordRevision })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .for('update')
        if (!user) throw new Error('Signed-in user is missing')

        const existing = new Map(
          (
            await tx
              .select({
                id: schema.records.id,
                revision: schema.records.revision,
                ciphertext: schema.records.ciphertext,
              })
              .from(schema.records)
              .where(and(eq(schema.records.userId, userId), inArray(schema.records.id, ids)))
          ).map((row) => [row.id, row]),
        )

        const result: PushResponse['revisions'] = {}
        const toSave: typeof changes = []
        const conflicts: string[] = []
        for (const change of changes) {
          const current = existing.get(change.id)
          // WID-10: a retried upload that was already saved changes nothing.
          if (current?.ciphertext === change.ciphertext) {
            result[change.id] = current.revision
          } else if (change.baseRevision !== (current?.revision ?? 0)) {
            conflicts.push(change.id)
          } else {
            toSave.push(change)
          }
        }
        if (conflicts.length > 0) throw new Conflict(conflicts)
        if (toSave.length === 0) return result

        let next = user.last
        const rows = toSave.map((change) => {
          next += 1
          result[change.id] = next
          return { userId, id: change.id, revision: next, ciphertext: change.ciphertext }
        })
        await tx
          .insert(schema.records)
          .values(rows)
          .onConflictDoUpdate({
            target: [schema.records.userId, schema.records.id],
            set: {
              revision: sql`excluded.revision`,
              ciphertext: sql`excluded.ciphertext`,
              updatedAt: sql`now()`,
            },
          })
        await tx
          .update(schema.users)
          .set({ recordRevision: next })
          .where(eq(schema.users.id, userId))
        return result
      })
      return c.json({ revisions } satisfies PushResponse)
    } catch (error) {
      if (error instanceof Conflict) {
        return c.json({ error: 'conflict', conflicts: error.ids } satisfies PushConflict, 409)
      }
      throw error
    }
  })

  routes.get('/records', async (c) => {
    const after = revision.safeParse(Number(c.req.query('after') ?? '0'))
    if (!after.success) return c.json({ error: 'invalid-request' }, 400)

    const rows = await db
      .select({
        id: schema.records.id,
        revision: schema.records.revision,
        ciphertext: schema.records.ciphertext,
      })
      .from(schema.records)
      .where(and(eq(schema.records.userId, c.var.userId), gt(schema.records.revision, after.data)))
      .orderBy(asc(schema.records.revision))
      .limit(maxPullChanges + 1)

    return c.json({
      changes: rows.slice(0, maxPullChanges),
      more: rows.length > maxPullChanges,
    } satisfies PullResponse)
  })

  return routes
}
