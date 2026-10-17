import { type HealthResponse } from '@repo/api'
import { serveStatic } from '@hono/node-server/serve-static'
import { type ErrorHandler, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { routePath } from 'hono/route'
import { secureHeaders } from 'hono/secure-headers'
import { attemptLimits, sameOrigin } from './auth/guard.ts'
import { sessionStore } from './auth/sessions.ts'
import { accountRoutes } from './routes/accounts.ts'
import { credentialRoutes } from './routes/credentials.ts'
import { inviteRoutes } from './routes/invites.ts'
import { passkeyRoutes } from './routes/passkeys.ts'
import { peopleRoutes } from './routes/people.ts'
import { recordRoutes } from './routes/records.ts'
import { recoveryRoutes } from './routes/recovery.ts'
import { sessionRoutes } from './routes/session.ts'
import type { Database } from './store/db.ts'

export interface AppOptions {
  db: Database
  // Known only to this server (see loadSecret).
  secret: string
  // The code that creates the account running the server (SYS-13); see index.ts.
  setupCode: () => string
  // Shows a new setup code when nobody runs the server any more; see index.ts.
  onNoOperator?: () => void
  // SYS-13: open sign-up stays off unless the operator turns it on.
  openSignUp?: boolean
  // An HTTPS proxy in front sets X-Forwarded-For (see auth/guard.ts).
  trustProxy?: boolean
  // Folder holding the built web app. The release image serves it from the same origin
  // as the API, so the browser only ever talks to its own server (NFR-05).
  webRoot?: string
}

// The server stores and syncs ciphertext and handles sign-in; it never reads user
// data. Routes are mounted under /api so the web app can be served from the same origin.
export function createApp({
  db,
  secret,
  setupCode,
  onNoOperator,
  openSignUp = false,
  trustProxy = false,
  webRoot,
}: AppOptions) {
  const sessions = sessionStore(db, secret)
  const limits = attemptLimits(trustProxy)
  const api = new Hono()
  api.onError(failed)

  // Refuse bodies far bigger than any real one before reading them: a batch of
  // records can be a few MiB (at most 500 records), everything else a few hundred bytes.
  const smallBodies = bodyLimit({ maxSize: 64 * 1024 })
  const recordBatches = bodyLimit({ maxSize: 16 * 1024 * 1024 })
  api.use((c, next) => (c.req.path === '/api/records' ? recordBatches : smallBodies)(c, next))
  api.use(sameOrigin(trustProxy))

  api.get('/health', (c) => c.json({ status: 'ok' } satisfies HealthResponse))

  api.route(
    '/',
    accountRoutes({ db, sessions, limits, secret, setupCode, openSignUp, onNoOperator }),
  )
  api.route('/', sessionRoutes({ db, sessions, limits }))
  api.route('/', recordRoutes({ db, sessions }))
  api.route('/', recoveryRoutes({ db, sessions, limits }))
  api.route('/', credentialRoutes({ db, sessions, limits }))
  api.route('/', inviteRoutes({ db, sessions }))
  api.route('/', peopleRoutes({ db, sessions }))
  api.route('/', passkeyRoutes({ db, sessions, limits }))

  const app = new Hono()
  app.onError(failed)
  app.use(appHeaders)
  app.route('/api', api)
  // An unknown API path is a 404, never the web app's page.
  app.all('/api/*', (c) => c.notFound())

  if (webRoot) {
    // Vite puts a content hash in every file under assets/, so those never change.
    // Everything else (index.html above all) is checked on each load, so a release
    // reaches the browser as soon as the server is updated.
    app.use('*', async (c, next) => {
      await next()
      if (c.res.ok) {
        c.res.headers.set(
          'Cache-Control',
          c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        )
      }
    })
    app.use('*', serveStatic({ root: webRoot }))
    // Client-side routes (/budget, /wallets/…) all load the same page.
    app.get('*', serveStatic({ root: webRoot, path: 'index.html' }))
  }

  return app
}

// SEC-01, NFR-01: the browser holds the keys and the decrypted data, so a script that got into
// the page could read everything. React already escapes what it shows; this policy is
// the second line: only the app's own files may run, load or be sent anywhere, and no
// other site may show the app in a frame. hash-wasm runs Argon2id as WebAssembly, which
// needs 'wasm-unsafe-eval' (it allows WebAssembly only, not eval). Sent from the app
// itself, on every response (the worker's script too), so every server has it, whatever
// sits in front.
const appHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'none'"],
    scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'"],
    connectSrc: ["'self'"],
    manifestSrc: ["'self'"],
    workerSrc: ["'self'"],
    baseUri: ["'none'"],
    formAction: ["'none'"],
    frameAncestors: ["'none'"],
    objectSrc: ["'none'"],
  },
  strictTransportSecurity: 'max-age=31536000',
  xFrameOptions: 'DENY',
  referrerPolicy: 'no-referrer',
})

// A failed query's message holds its values (Drizzle puts them there), which can be
// usernames, hashes or wrapped keys. The log gets only where it failed and what kind of
// error it was.
const failed: ErrorHandler = (error, c) => {
  if (error instanceof HTTPException) return error.getResponse()
  const cause: unknown = error.cause
  const code =
    cause && typeof cause === 'object' && 'code' in cause ? ` (${String(cause.code)})` : ''
  console.error(`${c.req.method} ${routePath(c)} failed: ${error.name}${code}`)
  return c.json({ error: 'server-error' }, 500)
}
