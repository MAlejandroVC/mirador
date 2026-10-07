import { describe, expect, it } from 'vitest'
import { healthResponse } from './health.ts'

describe('health response', () => {
  it('accepts only status ok', () => {
    expect(healthResponse.parse({ status: 'ok' })).toEqual({ status: 'ok' })
    expect(healthResponse.safeParse({ status: 'down' }).success).toBe(false)
  })
})
