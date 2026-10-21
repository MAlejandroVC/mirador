import { serve } from '@hono/node-server'
import { count } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { createApp } from './app.ts'
import { modelFiles, paddleEngine } from './ocr/engine.ts'
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
const setupCode = newCode()
function announceSetupCode() {
  console.log(`No accounts yet. Create the first one in the app with this setup code: ${setupCode}`)
}
const [users] = await db.select({ count: count() }).from(schema.users)
if (!users?.count) announceSetupCode()

// SEC-05: pictures are read on this server, in memory. Without the model files (a
// development checkout before `pnpm --filter @repo/server models`) it is simply off.
const models = modelFiles(
  process.env.OCR_MODELS_DIR ?? new URL('../models/', import.meta.url).pathname,
)
if (!models) console.log('Text recognition models not found: reading pictures is off')

const app = createApp({
  db,
  secret,
  setupCode,
  onNoAccounts: announceSetupCode,
  openSignUp: process.env.MIRADOR_OPEN_SIGNUP === 'true',
  trustProxy: process.env.MIRADOR_TRUST_PROXY === 'true',
  ...(process.env.WEB_ROOT ? { webRoot: process.env.WEB_ROOT } : {}),
  ocr: models ? paddleEngine(models) : null,
})

// SYS-23: removed accounts are deleted once their window ends: checked at start and
// every hour after.
async function cleanUp() {
  try {
    const { deleted, remaining } = await deleteRemovedAccounts(db)
    if (deleted > 0 && remaining === 0) announceSetupCode()
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
