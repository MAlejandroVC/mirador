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
