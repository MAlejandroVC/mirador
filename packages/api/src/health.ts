import { z } from 'zod'

// GET /api/health. Says only that the server is up: no version, user or data.
export const healthResponse = z.object({
  status: z.literal('ok'),
})

export type HealthResponse = z.infer<typeof healthResponse>
