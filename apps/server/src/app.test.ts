import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { healthResponse } from '@repo/api'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

describe('serving the built web app', () => {
  let webRoot: string

  beforeAll(() => {
    webRoot = mkdtempSync(join(tmpdir(), 'mirador-web-'))
    mkdirSync(join(webRoot, 'assets'))
    writeFileSync(join(webRoot, 'index.html'), '<!doctype html><title>Mirador</title>')
    writeFileSync(join(webRoot, 'assets', 'main-abc123.js'), 'console.log(1)')
  })

  afterAll(() => {
    rmSync(webRoot, { recursive: true, force: true })
  })

  it('serves the page at the root without letting the browser keep a stale copy', async () => {
    const response = await createApp({ webRoot }).request('/')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<title>Mirador</title>')
    expect(response.headers.get('cache-control')).toBe('no-cache')
  })

  it('caches hashed assets for good', async () => {
    const response = await createApp({ webRoot }).request('/assets/main-abc123.js')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('immutable')
  })

  it('answers client-side routes with the page', async () => {
    const response = await createApp({ webRoot }).request('/wallets/123')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<title>Mirador</title>')
    expect(response.headers.get('cache-control')).toBe('no-cache')
  })

  it('still answers 404 for unknown API paths', async () => {
    const response = await createApp({ webRoot }).request('/api/nope')

    expect(response.status).toBe(404)
  })

  it('keeps the API working', async () => {
    const response = await createApp({ webRoot }).request('/api/health')

    expect(await response.json()).toEqual({ status: 'ok' })
  })
})
