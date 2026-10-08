import { serve } from '@hono/node-server'
import { createApp } from './app.ts'

const port = Number(process.env.PORT ?? 3000)

const server = serve(
  { fetch: createApp({ webRoot: process.env.WEB_ROOT }).fetch, port },
  (info) => {
    console.log(`Mirador server listening on http://localhost:${info.port}`)
  },
)

// In a container the server is process 1, which gets no default signal handling:
// without this, `docker stop` waits ten seconds and then kills it.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
