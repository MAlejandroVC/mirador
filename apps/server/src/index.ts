import { serve } from '@hono/node-server'
import { count, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { createApp } from './app.ts'
import { deleteRemovedAccounts } from './routes/people.ts'
import { loadSecret, newCode } from './settings.ts'
import { migrationsFolder, schema } from './store/db.ts'

const port = Number(process.env.PORT ?? 3000)
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('Set DATABASE_URL to the PostgreSQL database')

const sql = postgres(databaseUrl, { onnotice: () => undefined })
const db = drizzle(sql, { schema })
await migrate(db, { migrationsFolder })

const secret = await loadSecret(db)
// SYS-13: a new code each time it is shown, so one that turned up in an old log
// can't be used later.
let setupCode = newCode()
function announceSetupCode() {
  setupCode = newCode()
  console.log(`Nobody runs this server yet. Sign up in the app with this setup code: ${setupCode}`)
}
const [operators] = await db
  .select({ count: count() })
  .from(schema.users)
  .where(eq(schema.users.operator, true))
if (!operators?.count) announceSetupCode()

const app = createApp({
  db,
  secret,
  setupCode: () => setupCode,
  onNoOperator: announceSetupCode,
  openSignUp: process.env.MIRADOR_OPEN_SIGNUP === 'true',
  trustProxy: process.env.MIRADOR_TRUST_PROXY === 'true',
  ...(process.env.WEB_ROOT ? { webRoot: process.env.WEB_ROOT } : {}),
})

// SYS-23: removed accounts are deleted once their window ends: checked at start and
// every hour after. The operator is never removed, so this never leaves the server
// without one.
async function cleanUp() {
  try {
    await deleteRemovedAccounts(db)
  } catch (error) {
    console.error('Deleting removed accounts failed', error)
  }
}
await cleanUp()
setInterval(() => void cleanUp(), 60 * 60 * 1000).unref()

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Mirador server listening on http://localhost:${info.port}`)
})

// In a container the server is process 1, which gets no default signal handling:
// without this, `docker stop` waits ten seconds and then kills it.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void sql.end().then(() => process.exit(0))
    })
  })
}
