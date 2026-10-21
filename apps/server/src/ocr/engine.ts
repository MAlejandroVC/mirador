import type { OcrResponse } from '@repo/api'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'

// IMP-05, IMP-07, IMP-11, SEC-05: text recognition on the server, in memory. One worker
// thread keeps the models loaded and reads one picture at a time, so a small server
// stays responsive; pictures beyond a short queue are turned away to be retried.

export interface OcrEngine {
  /** The words in the picture, or null when it isn't a picture that can be decoded. */
  read(image: Uint8Array): Promise<OcrResponse | null>
}

/** Too many pictures are waiting; the browser tries again shortly. */
export class OcrBusy extends Error {
  constructor() {
    super('busy')
  }
}

export interface ModelFiles {
  detection: string
  recognition: string
  dictionary: string
}

/** The model files in `dir`, or null when they aren't all there (see MODELS.md). */
export function modelFiles(dir: string): ModelFiles | null {
  const files = {
    detection: join(dir, 'detection.onnx'),
    recognition: join(dir, 'recognition.onnx'),
    dictionary: join(dir, 'dictionary.txt'),
  }
  return Object.values(files).every((file) => existsSync(file)) ? files : null
}

type Reply = { id: number; result: OcrResponse | null } | { id: number; failed: true }

export function paddleEngine(models: ModelFiles, maxWaiting = 4): OcrEngine {
  let worker: Worker | null = null
  let nextId = 0
  const pending = new Map<
    number,
    { resolve: (result: OcrResponse | null) => void; reject: (error: Error) => void }
  >()

  function start() {
    // Run from source in development and tests, from the bundle in the release image.
    const file = import.meta.url.endsWith('.ts') ? './ocr-worker.ts' : './ocr-worker.mjs'
    const started = new Worker(new URL(file, import.meta.url), { workerData: models })
    started.on('message', (reply: Reply) => {
      const job = pending.get(reply.id)
      pending.delete(reply.id)
      if (!job) return
      if ('failed' in reply) job.reject(new Error('OCR failed'))
      else job.resolve(reply.result)
    })
    // A crashed worker fails what it held; the next picture starts a new one.
    started.on('error', () => {
      worker = null
      for (const job of pending.values()) job.reject(new Error('OCR stopped'))
      pending.clear()
    })
    started.unref()
    return started
  }

  // Pictures wait their turn, so only one is ever being read.
  let queue: Promise<unknown> = Promise.resolve()
  let waiting = 0

  return {
    read(image) {
      if (waiting >= maxWaiting) return Promise.reject(new OcrBusy())
      waiting += 1
      const turn = queue.then(
        () =>
          new Promise<OcrResponse | null>((resolve, reject) => {
            worker ??= start()
            const id = (nextId += 1)
            pending.set(id, { resolve, reject })
            // A copy moves to the worker, which clears it after reading.
            const copy = image.slice()
            worker.postMessage({ id, image: copy.buffer }, [copy.buffer])
          }),
      )
      queue = turn
        .catch(() => undefined)
        .finally(() => {
          waiting -= 1
        })
      return turn
    },
  }
}
