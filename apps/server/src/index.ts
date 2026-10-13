import { serve } from '@hono/node-server'
import { count } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { createApp } from './app.ts'
import { loadSecret, newSetupCode } from './settings.ts'
import { migrationsFolder, schema } from './store/db.ts'

const port = Number(process.env.PORT ?? 3000)
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('Set DATABASE_URL to the PostgreSQL database')

const sql = postgres(databaseUrl, { onnotice: () => undefined })
const db = drizzle(sql, { schema })
await migrate(db, { migrationsFolder })

const secret = await loadSecret(db)
const setupCode = newSetupCode()
const [users] = await db.select({ count: count() }).from(schema.users)
if (!users?.count) {
  console.log(`No accounts yet. Create the first one in the app with this setup code: ${setupCode}`)
}

const app = createApp({
  db,
  secret,
  setupCode,
  openSignUp: process.env.MIRADOR_OPEN_SIGNUP === 'true',
  ...(process.env.WEB_ROOT ? { webRoot: process.env.WEB_ROOT } : {}),
})

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
