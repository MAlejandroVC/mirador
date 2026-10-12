import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema.ts'

export { schema }

// The server runs on PostgreSQL through postgres.js; tests run the same migrations on
// PGlite, PostgreSQL compiled to WebAssembly, so they need no database server.
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>

// Migrations sit next to the source in development and next to the bundle in the
// release image (MIGRATIONS_DIR).
export const migrationsFolder =
  process.env.MIGRATIONS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle')
