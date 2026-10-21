import { maxOcrBytes, type OcrError, ocrImageTypes } from '@repo/api'
import { Hono } from 'hono'
import { requireUser, type SessionStore, type SessionVariables } from '../auth/sessions.ts'
import { OcrBusy, type OcrEngine } from '../ocr/engine.ts'

export interface OcrRoutesOptions {
  sessions: SessionStore
  /** Null when the server runs without its models (see MODELS.md). */
  engine: OcrEngine | null
}

// IMP-05, IMP-07, IMP-11, SEC-05: the one place the server sees a person's data in the
// clear: a picture to read, sent over HTTPS by its signed-in owner. It stays in this
// request's memory and is cleared before the answer goes out; nothing about it is
// stored or logged, and the answer is never cached.
export function ocrRoutes({ sessions, engine }: OcrRoutesOptions) {
  const routes = new Hono<{ Variables: SessionVariables }>()
  routes.use('/ocr', requireUser(sessions))

  routes.post('/ocr', async (c) => {
    c.header('Cache-Control', 'no-store')
    if (!engine) return c.json({ error: 'ocr-unavailable' } satisfies OcrError, 503)
    const type = (c.req.header('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
    if (!(ocrImageTypes as readonly string[]).includes(type))
      return c.json({ error: 'not-an-image' } satisfies OcrError, 415)
    const image = new Uint8Array(await c.req.arrayBuffer())
    try {
      if (image.byteLength === 0) return c.json({ error: 'not-an-image' } satisfies OcrError, 400)
      if (image.byteLength > maxOcrBytes)
        return c.json({ error: 'too-large' } satisfies OcrError, 413)
      const result = await engine.read(image)
      if (!result) return c.json({ error: 'unreadable' } satisfies OcrError, 422)
      return c.json(result)
    } catch (error) {
      if (error instanceof OcrBusy) {
        c.header('Retry-After', '2')
        return c.json({ error: 'busy' } satisfies OcrError, 503)
      }
      return c.json({ error: 'unreadable' } satisfies OcrError, 422)
    } finally {
      image.fill(0)
    }
  })

  return routes
}
