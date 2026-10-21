import { createCanvas, loadImage } from '@napi-rs/canvas'
import { parentPort, workerData } from 'node:worker_threads'
import { PaddleOcrService } from 'ppu-paddle-ocr'
import type { ModelFiles } from './engine.ts'

// The worker thread that reads pictures (SEC-05): each one arrives as bytes in memory,
// is decoded, read and cleared. Nothing is written to disk or logged; the model files
// are the only thing it opens.

const models = workerData as ModelFiles
const service = new PaddleOcrService({
  model: {
    detection: models.detection,
    recognition: models.recognition,
    charactersDictionary: models.dictionary,
  },
  processing: { engine: 'canvas-native' },
})
const ready = service.initialize()

// Very big photos are scaled down first. The limit stays high: the recognition model
// loses the spaces between words when letters are only a few pixels tall.
const maxSide = 4096

parentPort?.on('message', (message: { id: number; image: ArrayBuffer }) => {
  void read(message)
})

async function read({ id, image }: { id: number; image: ArrayBuffer }) {
  const bytes = new Uint8Array(image)
  try {
    await ready
    let picture
    try {
      picture = await loadImage(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    } catch {
      parentPort?.postMessage({ id, result: null })
      return
    }
    const scale = Math.min(1, maxSide / Math.max(picture.width, picture.height))
    const width = Math.max(1, Math.round(picture.width * scale))
    const height = Math.max(1, Math.round(picture.height * scale))
    const canvas = createCanvas(width, height)
    canvas.getContext('2d').drawImage(picture, 0, 0, width, height)
    const result = await service.recognize(canvas)
    const words = result.lines.flat().map((word) => ({
      text: word.text,
      x: word.box.x,
      y: word.box.y,
      width: word.box.width,
      height: word.box.height,
      confidence: Math.min(1, Math.max(0, word.confidence)),
    }))
    // The drawing is cleared too, not only the bytes it came from.
    canvas.getContext('2d').clearRect(0, 0, width, height)
    parentPort?.postMessage({ id, result: { width, height, words } })
  } catch {
    parentPort?.postMessage({ id, failed: true })
  } finally {
    bytes.fill(0)
  }
}
