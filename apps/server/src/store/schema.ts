import { boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// The server's own tables. None of them holds anything it can read about a user's
// money: sign-in data, and key material that only the browser can use (SEC-04).

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

// Better Auth's tables. Property names are what Better Auth expects; columns are ours.
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  // Better Auth requires a name; Mirador doesn't ask for one, so it stays empty.
  name: text('name').notNull(),
  // What people sign in with (Better Auth's username plugin), always lower case.
  username: text('username').notNull().unique(),
  // Better Auth requires an email too. Mirador doesn't ask for one: this is a made-up
  // <username>@users.invalid address that is never shown or used.
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt,
  updatedAt,
})

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt,
    updatedAt,
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
)

// Better Auth's sign-in methods per user. For a password account, `password` holds
// the server's hash of the login secret, never of the password itself (SEC-03).
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt,
    updatedAt,
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
)

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
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

// Values the server makes for itself on first start, such as the secret that signs
// session cookies, so an operator has nothing extra to configure.
export const serverSettings = pgTable('server_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt,
})
