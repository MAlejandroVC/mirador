import { generateRandomString } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { type Database, schema } from './store/db.ts'

// The secret that signs session cookies. An operator can set BETTER_AUTH_SECRET;
// otherwise the server makes one on first start and keeps it in the database, so
// there is nothing extra to configure and it survives updates.
export async function loadSecret(db: Database, fromEnv = process.env.BETTER_AUTH_SECRET) {
  if (fromEnv) return fromEnv
  await db
    .insert(schema.serverSettings)
    .values({ key: 'auth_secret', value: generateRandomString(64) })
    .onConflictDoNothing()
  const [row] = await db
    .select({ value: schema.serverSettings.value })
    .from(schema.serverSettings)
    .where(eq(schema.serverSettings.key, 'auth_secret'))
  if (!row) throw new Error('Could not store the session secret')
  return row.value
}

// SYS-13: the first account needs a code that only the person running the server can
// read, in its log, so finding the address of a fresh server isn't enough to claim it.
// A new code is made at every start and is useless once an account exists.
export function newSetupCode() {
  const code = generateRandomString(20, 'A-Z', '0-9')
  return code.match(/.{4}/g)?.join('-') ?? code
}

// Read from a log by a person: case, spaces and dashes don't matter, and the letters
// that look like digits count as those digits.
export function normalizeSetupCode(code: string) {
  return code.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0')
}
