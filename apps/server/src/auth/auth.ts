import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Database } from '../store/db.ts'
import { schema } from '../store/db.ts'

export interface AuthOptions {
  db: Database
  // Signs session cookies. Made on first start and kept in server_settings.
  secret: string
  // The public address, such as https://mirador.example.com. Without it the address
  // comes from the request, through the HTTPS proxy's X-Forwarded headers.
  baseURL?: string
  rateLimit?: boolean
}

const day = 24 * 60 * 60

// SYS-06: each person signs in with their own account and stays signed in on their
// devices until they sign out. SEC-03: what Better Auth calls the password is the
// login secret the browser derived; Better Auth hashes it again before storing it.
export function createAuth({ db, secret, baseURL, rateLimit = false }: AuthOptions) {
  return betterAuth({
    appName: 'Mirador',
    basePath: '/api/auth',
    secret,
    // Any host the HTTPS proxy forwards: the operator chose the domain when pointing
    // it at this server.
    baseURL: baseURL ?? { allowedHosts: ['*'], protocol: 'auto' },
    database: drizzleAdapter(db, {
      provider: 'pg',
      usePlural: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // Accounts are created only through POST /api/accounts, which also stores the
      // key material and checks whether this server takes new accounts (SYS-13).
      disableSignUp: false,
      // A login secret is always 43 characters; anything else isn't one.
      minPasswordLength: 43,
      maxPasswordLength: 43,
      // The server sends no email (NFR-05); a forgotten password goes through the
      // recovery key (SEC-07).
      requireEmailVerification: false,
    },
    session: {
      // Signed in until they sign out: each visit pushes the expiry out again.
      expiresIn: 60 * day,
      updateAge: day,
    },
    rateLimit: { enabled: rateLimit, window: 60, max: 100 },
    advanced: {
      // The release image runs behind an HTTPS proxy (Caddy) that sets these.
      trustedProxyHeaders: true,
    },
    // NFR-05: no telemetry. Better Auth sends none unless asked to; say so anyway.
    telemetry: { enabled: false },
  })
}

export type Auth = ReturnType<typeof createAuth>
