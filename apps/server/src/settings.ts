import { eq } from 'drizzle-orm'
import { randomCode, randomToken } from './auth/secrets.ts'
import { type Database, schema } from './store/db.ts'

// A secret only this server knows, for answers that must stay the same between
// requests without being guessable (see prelogin). An operator can set MIRADOR_SECRET;
// otherwise the server makes one on first start and keeps it in the database.
export async function loadSecret(db: Database, fromEnv = process.env.MIRADOR_SECRET) {
  if (fromEnv) return fromEnv
  await db
    .insert(schema.serverSettings)
    .values({ key: 'server_secret', value: randomToken() })
    .onConflictDoNothing()
  const [row] = await db
    .select({ value: schema.serverSettings.value })
    .from(schema.serverSettings)
    .where(eq(schema.serverSettings.key, 'server_secret'))
  if (!row) throw new Error('Could not store the server secret')
  return row.value
}

// SYS-13: the first account needs a code that only the person running the server can
// read, in its log, so finding the address of a fresh server isn't enough to claim it.
// A new code is made at every start and is useless once an account exists.
export function newSetupCode() {
  const code = randomCode(20, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
  return code.match(/.{4}/g)?.join('-') ?? code
}

// Read from a log by a person: case, spaces and dashes don't matter, and the letters
// that look like digits count as those digits.
export function normalizeSetupCode(code: string) {
  return code.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0')
}
