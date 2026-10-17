import { createMiddleware } from 'hono/factory'
import { validator } from 'hono/validator'
import type { z } from 'zod'

// Validates a JSON body against its @repo/api schema. Hono rejects any other content
// type, so a plain cross-site form can't post to the API (a JSON post from another
// site needs CORS, which the server never allows).
export function jsonBody<Schema extends z.ZodType>(schema: Schema) {
  return validator('json', (value, c) => {
    const parsed = schema.safeParse(value)
    if (!parsed.success) return c.json({ error: 'invalid-request' }, 400)
    return parsed.data
  })
}

// Ids in paths are random base64url tokens or passkey credential ids (base64url too).
// Anything else, such as a NUL byte PostgreSQL would refuse, is a 404 before any query.
export const idParam = createMiddleware(async (c, next) => {
  if (!/^[A-Za-z0-9_-]{1,1024}$/.test(c.req.param('id') ?? '')) return c.notFound()
  await next()
})
