import {
  type AnyPgColumn,
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

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
  // The last revision given to one of this user's records (see records).
  recordRevision: bigint('record_revision', { mode: 'number' }).notNull().default(0),
  // SYS-13: whoever created the server's first account runs it and can invite people.
  operator: boolean('operator').notNull().default(false),
  // SYS-22: the invite this account signed up with, so the operator sees who joined
  // through each link.
  inviteId: text('invite_id').references((): AnyPgColumn => invites.id, {
    onDelete: 'set null',
  }),
  // SYS-22, SYS-23: when the operator removed this account. From then on it can only
  // sign in to download its data, and it is deleted when the window ends.
  removedAt: timestamp('removed_at', { withTimezone: true }),
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

// SYS-13, SYS-21: invite links the operator made. The code is in the link the operator
// shares; the table keeps only its hash, so a copy of it can't be used to sign up.
export const invites = pgTable(
  'invites',
  {
    id: text('id').primaryKey(),
    codeHash: text('code_hash').notNull().unique(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // How many people may sign up with it; null for no limit.
    maxUses: integer('max_uses'),
    useCount: integer('use_count').notNull().default(0),
    // Set when the operator ends it before it expires.
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt,
  },
  (table) => [index('invites_created_by_idx').on(table.createdBy)],
)

// SYS-06: passkeys a user added. Each one keeps its own copy of the account key,
// wrapped by a key only that passkey can produce in the browser (its PRF output, which
// the server never receives). The public key only checks sign-ins.
export const passkeys = pgTable(
  'passkeys',
  {
    // The credential id, base64url.
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    publicKey: text('public_key').notNull(),
    counter: bigint('counter', { mode: 'number' }).notNull().default(0),
    transports: text('transports').array().notNull().default([]),
    wrappedAccountKey: text('wrapped_account_key').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt,
  },
  (table) => [index('passkeys_user_id_idx').on(table.userId)],
)

// Values the server makes for itself on first start, so an operator has nothing extra
// to configure.
export const serverSettings = pgTable('server_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt,
})

// SEC-01, SEC-04: a user's data, one row per record, as ciphertext only. The server
// knows each record's id, revision, size and when it last changed (SEC-10), and
// nothing else: not its type, its contents or whether it was deleted.
export const records = pgTable(
  'records',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // A UUIDv7 made in the browser.
    id: text('id').notNull(),
    revision: bigint('revision', { mode: 'number' }).notNull(),
    ciphertext: text('ciphertext').notNull(),
    updatedAt,
  },
  (table) => [
    // SEC-09: ids are per user, so one user's id can never reach another's row.
    primaryKey({ columns: [table.userId, table.id] }),
    index('records_user_id_revision_idx').on(table.userId, table.revision),
  ],
)
