import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// The server's own tables. None of them holds anything it can read about a user's
// money: sign-in data, and key material that only the browser can use (SEC-04).

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

// One row per account. Mirador asks for no email or name: a username is all it
// needs to sign someone in, and anything more would be personal data kept for nothing.
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  // Always lower case (see @repo/api).
  username: text('username').notNull().unique(),
  // The server's hash of the login secret the browser derived, never of the password
  // itself (SEC-03).
  loginSecretHash: text('login_secret_hash').notNull(),
  createdAt,
  updatedAt,
})

// One row per signed-in device. The id is a hash of the token in the device's cookie,
// so a copy of this table can't be used to sign in.
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt,
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
)

// SEC-02, SEC-07: what the browser needs to rebuild its keys. The salt and cost are
// public by design; both wrapped keys are AES-KW ciphertext made with keys the server
// never sees; the recovery secret is stored only as a hash.
export const keyMaterial = pgTable('key_material', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  kdfAlgorithm: text('kdf_algorithm').notNull(),
  kdfSalt: text('kdf_salt').notNull(),
  kdfMemoryKib: integer('kdf_memory_kib').notNull(),
  kdfIterations: integer('kdf_iterations').notNull(),
  kdfParallelism: integer('kdf_parallelism').notNull(),
  wrappedKeyPassword: text('wrapped_key_password').notNull(),
  wrappedKeyRecovery: text('wrapped_key_recovery').notNull(),
  recoverySecretHash: text('recovery_secret_hash').notNull(),
  createdAt,
  updatedAt,
})

// Values the server makes for itself on first start, so an operator has nothing extra
// to configure.
export const serverSettings = pgTable('server_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt,
})
