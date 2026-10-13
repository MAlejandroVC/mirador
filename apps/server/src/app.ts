import { type HealthResponse } from '@repo/api'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { attemptLimits, sameOrigin } from './auth/guard.ts'
import { sessionStore } from './auth/sessions.ts'
import { accountRoutes } from './routes/accounts.ts'
import { credentialRoutes } from './routes/credentials.ts'
import { inviteRoutes } from './routes/invites.ts'
import { recordRoutes } from './routes/records.ts'
import { recoveryRoutes } from './routes/recovery.ts'
import { sessionRoutes } from './routes/session.ts'
import type { Database } from './store/db.ts'

export interface AppOptions {
  db: Database
  // Known only to this server (see loadSecret).
  secret: string
  // Needed to create the first account (SYS-13); see index.ts.
  setupCode: string
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
  openSignUp = false,
  trustProxy = false,
  webRoot,
}: AppOptions) {
  const sessions = sessionStore(db)
  const limits = attemptLimits(trustProxy)
  const api = new Hono()

  // Refuse bodies far bigger than any real one before reading them: a batch of
  // records can be a few MiB (at most 500 records), everything else a few hundred bytes.
  const smallBodies = bodyLimit({ maxSize: 64 * 1024 })
  const recordBatches = bodyLimit({ maxSize: 16 * 1024 * 1024 })
  api.use((c, next) => (c.req.path === '/api/records' ? recordBatches : smallBodies)(c, next))
  api.use(sameOrigin)

  api.get('/health', (c) => c.json({ status: 'ok' } satisfies HealthResponse))

  api.route('/', accountRoutes({ db, sessions, limits, secret, setupCode, openSignUp }))
  api.route('/', sessionRoutes({ db, sessions, limits }))
  api.route('/', recordRoutes({ db, sessions }))
  api.route('/', recoveryRoutes({ db, sessions, limits }))
  api.route('/', credentialRoutes({ db, sessions, limits }))
  api.route('/', inviteRoutes({ db, sessions }))

  const app = new Hono()
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
