import { type HealthResponse } from '@repo/api'
import { Hono } from 'hono'

// The server stores and syncs ciphertext and handles sign-in; it never reads user
// data. Routes are mounted under /api so the web app can be served from the same origin.
export function createApp() {
  const app = new Hono().basePath('/api')

  app.get('/health', (c) => c.json({ status: 'ok' } satisfies HealthResponse))

  return app
}
