import { healthResponse } from '@repo/api'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'

describe('GET /api/health', () => {
  it('answers ok with nothing but the status', async () => {
    const response = await createApp().request('/api/health')

    expect(response.status).toBe(200)
    expect(healthResponse.strict().parse(await response.json())).toEqual({ status: 'ok' })
  })

  it('answers 404 outside the routes it knows', async () => {
    const response = await createApp().request('/api/nope')

    expect(response.status).toBe(404)
  })
})
