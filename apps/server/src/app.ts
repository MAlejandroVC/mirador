import { type HealthResponse } from '@repo/api'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createAuth } from './auth/auth.ts'
import { accountRoutes } from './routes/accounts.ts'
import type { Database } from './store/db.ts'

export interface AppOptions {
  db: Database
  // Signs session cookies (see loadSecret).
  secret: string
  // Needed to create the first account (SYS-13); see index.ts.
  setupCode: string
  // SYS-13: open sign-up stays off unless the operator turns it on.
  openSignUp?: boolean
  // The public address; inferred from the HTTPS proxy's headers when not set.
  baseURL?: string
  rateLimit?: boolean
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
  baseURL,
  rateLimit,
  webRoot,
}: AppOptions) {
  const auth = createAuth({ db, secret, ...(baseURL ? { baseURL } : {}), rateLimit })
  const api = new Hono()

  api.get('/health', (c) => c.json({ status: 'ok' } satisfies HealthResponse))

  api.route('/', accountRoutes({ db, auth, secret, setupCode, openSignUp }))

  // Better Auth's own sign-up would create an account without key material and
  // without the sign-up checks, so only POST /api/accounts creates accounts.
  api.all('/auth/sign-up/*', (c) => c.notFound())
  // People sign in with their username; the email Better Auth keeps is made up.
  api.all('/auth/sign-in/email', (c) => c.notFound())
  api.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw))

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
