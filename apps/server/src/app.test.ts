import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { healthResponse } from '@repo/api'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './test-app.ts'

describe('GET /api/health', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app']

  beforeAll(async () => {
    ;({ app } = await createTestApp())
  })

  it('answers ok with nothing but the status', async () => {
    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    expect(healthResponse.strict().parse(await response.json())).toEqual({ status: 'ok' })
  })

  it('answers 404 outside the routes it knows', async () => {
    const response = await app.request('/api/nope')

    expect(response.status).toBe(404)
  })
})

describe('serving the built web app', () => {
  let webRoot: string
  let app: Awaited<ReturnType<typeof createTestApp>>['app']

  beforeAll(async () => {
    webRoot = mkdtempSync(join(tmpdir(), 'mirador-web-'))
    mkdirSync(join(webRoot, 'assets'))
    writeFileSync(join(webRoot, 'index.html'), '<!doctype html><title>Mirador</title>')
    writeFileSync(join(webRoot, 'assets', 'main-abc123.js'), 'console.log(1)')
    ;({ app } = await createTestApp({ webRoot }))
  })

  afterAll(() => {
    rmSync(webRoot, { recursive: true, force: true })
  })

  it('serves the page at the root without letting the browser keep a stale copy', async () => {
    const response = await app.request('/')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<title>Mirador</title>')
    expect(response.headers.get('cache-control')).toBe('no-cache')
  })

  it('caches hashed assets for good', async () => {
    const response = await app.request('/assets/main-abc123.js')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('immutable')
  })

  it('answers client-side routes with the page', async () => {
    const response = await app.request('/wallets/123')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<title>Mirador</title>')
    expect(response.headers.get('cache-control')).toBe('no-cache')
  })

  it('still answers 404 for unknown API paths', async () => {
    const response = await app.request('/api/nope')

    expect(response.status).toBe(404)
  })

  it('keeps the API working', async () => {
    const response = await app.request('/api/health')

    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it("NFR-01: every response says only the app's own files may run, and no site may frame it", async () => {
    for (const path of [
      '/',
      '/assets/main-abc123.js',
      '/wallets/123',
      '/api/health',
      '/api/nope',
    ]) {
      const headers = (await app.request(path)).headers
      const policy = headers.get('content-security-policy') ?? ''
      expect(policy).toContain("default-src 'none'")
      expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'")
      expect(policy).toContain("frame-ancestors 'none'")
      expect(policy).not.toContain('unsafe-inline')
      expect(policy).not.toMatch(/'unsafe-eval'/)
      expect(headers.get('x-frame-options')).toBe('DENY')
      expect(headers.get('x-content-type-options')).toBe('nosniff')
      expect(headers.get('referrer-policy')).toBe('no-referrer')
      expect(headers.get('strict-transport-security')).toBe('max-age=31536000')
    }
  })
})
