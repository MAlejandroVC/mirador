import { type HealthResponse } from '@repo/api'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

export interface AppOptions {
  // Folder holding the built web app. The release image serves it from the same origin
  // as the API, so the browser only ever talks to its own server (NFR-05).
  webRoot?: string
}

// The server stores and syncs ciphertext and handles sign-in; it never reads user
// data. Routes are mounted under /api so the web app can be served from the same origin.
export function createApp({ webRoot }: AppOptions = {}) {
  const api = new Hono()

  api.get('/health', (c) => c.json({ status: 'ok' } satisfies HealthResponse))

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
