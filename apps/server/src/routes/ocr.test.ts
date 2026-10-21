import { createCanvas } from '@napi-rs/canvas'
import { maxOcrBytes, ocrResponse, type OcrResponse } from '@repo/api'
import { count } from 'drizzle-orm'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OcrBusy, type OcrEngine, paddleEngine } from '../ocr/engine.ts'
import { schema } from '../store/db.ts'
import {
  createTestApp,
  newAccount,
  signUp,
  testHost,
  testOrigin,
  testSetupCode,
  type TestServer,
} from '../test-app.ts'

function send(server: TestServer, body: Uint8Array, cookie?: string, type = 'image/jpeg') {
  return server.app.request('/api/ocr', {
    method: 'POST',
    headers: {
      Host: testHost,
      Origin: testOrigin,
      'Content-Type': type,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body,
  })
}

const reading: OcrResponse = {
  width: 400,
  height: 300,
  words: [{ text: 'TOTAL', x: 10, y: 10, width: 60, height: 14, confidence: 0.98 }],
}

/** A stand-in that remembers what it was given, to check the picture is cleared. */
function fakeEngine(answer: OcrResponse | null = reading) {
  const seen: Uint8Array[] = []
  const engine: OcrEngine = {
    read: (image) => {
      seen.push(image)
      return Promise.resolve(answer)
    },
  }
  return { engine, seen }
}

describe('reading pictures', () => {
  let server: TestServer
  let cookie: string
  let fake: ReturnType<typeof fakeEngine>

  beforeEach(async () => {
    fake = fakeEngine()
    server = await createTestApp({ ocr: fake.engine })
    cookie = await signUp(server, newAccount('ana', { setupCode: testSetupCode }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('IMP-05: answers a signed-in person with the words and where they are', async () => {
    const response = await send(server, new Uint8Array([1, 2, 3]), cookie)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(ocrResponse.parse(await response.json())).toEqual(reading)
  })

  it('SEC-05: keeps nothing: the picture is cleared, nothing is stored or logged', async () => {
    const logs = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'debug'),
    ]
    const writes = [
      vi.spyOn(fs, 'writeFileSync'),
      vi.spyOn(fs, 'writeFile'),
      vi.spyOn(fs, 'appendFileSync'),
      vi.spyOn(fs, 'createWriteStream'),
      vi.spyOn(fs.promises, 'writeFile'),
      vi.spyOn(fs.promises, 'appendFile'),
    ]
    const before = await server.db.select({ count: count() }).from(schema.records)
    const picture = new Uint8Array(4096).fill(7)
    expect((await send(server, picture, cookie)).status).toBe(200)

    expect(fake.seen).toHaveLength(1)
    expect(fake.seen[0]?.every((byte) => byte === 0)).toBe(true)
    for (const spy of [...logs, ...writes]) expect(spy).not.toHaveBeenCalled()
    const after = await server.db.select({ count: count() }).from(schema.records)
    expect(after).toEqual(before)
  })

  it('SEC-09: refuses anyone not signed in, before reading the picture', async () => {
    const response = await send(server, new Uint8Array([1, 2, 3]))
    expect(response.status).toBe(401)
    expect(fake.seen).toHaveLength(0)
  })

  it('SEC-05: refuses what isn’t a picture, or one far too big, unread', async () => {
    expect((await send(server, new Uint8Array([1]), cookie, 'application/pdf')).status).toBe(415)
    expect((await send(server, new Uint8Array(), cookie)).status).toBe(400)
    const big = await send(server, new Uint8Array(maxOcrBytes + 1), cookie)
    expect(big.status).toBe(413)
    expect(await big.json()).toEqual({ error: 'too-large' })
    expect(fake.seen).toHaveLength(0)
  })

  it('IMP-10: says a picture couldn’t be read rather than answering with nothing', async () => {
    server = await createTestApp({ ocr: fakeEngine(null).engine })
    cookie = await signUp(server, newAccount('ana', { setupCode: testSetupCode }))
    const response = await send(server, new Uint8Array([1, 2, 3]), cookie)
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'unreadable' })
  })

  it('IMP-11: asks the browser to try again when pictures are queued up', async () => {
    const busy: OcrEngine = { read: () => Promise.reject(new OcrBusy()) }
    server = await createTestApp({ ocr: busy })
    cookie = await signUp(server, newAccount('ana', { setupCode: testSetupCode }))
    const response = await send(server, new Uint8Array([1, 2, 3]), cookie)
    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('2')
  })

  it('IMP-11: says when the server runs without its models', async () => {
    server = await createTestApp()
    cookie = await signUp(server, newAccount('ana', { setupCode: testSetupCode }))
    const response = await send(server, new Uint8Array([1, 2, 3]), cookie)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'ocr-unavailable' })
  })
})

describe('the text recognition engine', () => {
  // The same model files the release image ships (MODELS.md).
  const require = createRequire(import.meta.url)
  const source = join(dirname(require.resolve('paddle-ocr-onnx-models/package.json')), 'models')
  const engine = paddleEngine({
    detection: join(source, 'ch_PP-OCRv4_det_infer.onnx'),
    recognition: join(source, 'en_PP-OCRv4_rec.onnx'),
    dictionary: fileURLToPath(new URL('../../models/dictionary.txt', import.meta.url)),
  })

  function ticket() {
    const canvas = createCanvas(520, 260)
    const context = canvas.getContext('2d')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, 520, 260)
    context.fillStyle = '#222'
    context.font = '26px sans-serif'
    context.fillText('OXXO SUC 1234', 30, 50)
    context.fillText('20/10/2026 19:42', 30, 110)
    context.fillText('TOTAL      $248.50', 30, 170)
    return new Uint8Array(canvas.toBuffer('image/png'))
  }

  it('IMP-07: reads a ticket on the server, word by word with confidence', async () => {
    const result = await engine.read(ticket())
    expect(result).not.toBeNull()
    const text = result?.words.map((word) => word.text).join(' ') ?? ''
    expect(text).toContain('OXXO')
    expect(text).toContain('20/10/2026')
    expect(text).toContain('$248.50')
    for (const word of result?.words ?? []) expect(word.confidence).toBeGreaterThan(0.5)
  })

  it('IMP-10: turns away bytes that aren’t a picture without failing', async () => {
    expect(await engine.read(new Uint8Array([1, 2, 3, 4]))).toBeNull()
  })

  it('IMP-11: reads one picture at a time and turns away a long queue', async () => {
    const small = paddleEngine(
      {
        detection: join(source, 'ch_PP-OCRv4_det_infer.onnx'),
        recognition: join(source, 'en_PP-OCRv4_rec.onnx'),
        dictionary: fileURLToPath(new URL('../../models/dictionary.txt', import.meta.url)),
      },
      2,
    )
    const reads = [small.read(ticket()), small.read(ticket()), small.read(ticket())]
    const settled = await Promise.allSettled(reads)
    expect(settled.map((item) => item.status)).toEqual(['fulfilled', 'fulfilled', 'rejected'])
    expect((settled[2] as PromiseRejectedResult).reason).toBeInstanceOf(OcrBusy)
  })
})
