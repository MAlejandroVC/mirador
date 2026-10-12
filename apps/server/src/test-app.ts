import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { type AppOptions, createApp } from './app.ts'
import { migrationsFolder, schema } from './store/db.ts'

export const testSetupCode = 'TEST-SETU-PCOD-E123-4567'
// Browsers always send these; Better Auth works out the server's address from them.
export const testHost = 'localhost'
export const testOrigin = 'http://localhost'

let shared: PgliteDatabase<typeof schema> | undefined

// A server on an in-memory PostgreSQL (PGlite) with the real migrations. Starting
// PGlite takes a second or two, so each test file keeps one and every call starts
// from empty tables: one test server at a time per file.
export async function createTestApp(options: Partial<AppOptions> = {}) {
  if (!shared) {
    shared = drizzle({ client: new PGlite(), schema })
    await migrate(shared, { migrationsFolder })
  }
  const db = shared
  await db.execute(
    sql.raw(
      'truncate users, sessions, accounts, verifications, key_material, server_settings cascade',
    ),
  )
  const app = createApp({
    db,
    secret: 'a-test-secret-that-is-long-enough-for-better-auth',
    setupCode: testSetupCode,
    ...options,
  })
  return { app, db }
}
