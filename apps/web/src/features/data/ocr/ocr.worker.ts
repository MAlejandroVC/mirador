// Runs first: it points ONNX Runtime at the app's own copy of its WebAssembly.
import './ort-setup'
import type { TextPage } from '@repo/import'
import { expose } from 'comlink'
import detection from 'paddle-ocr-onnx-models/models/ch_PP-OCRv4_det_infer.onnx?url'
import recognition from 'paddle-ocr-onnx-models/models/en_PP-OCRv4_rec.onnx?url'
import { PaddleOcrService } from 'ppu-paddle-ocr/web'
import dictionary from './dictionary.txt?url'

// IMP-05, IMP-07, IMP-11: text recognition on the person's own device, in a worker so
// the screen stays responsive. A picture never leaves the browser: the models come
// from the app's own server (MODELS.md) and are cached like the rest of the app.

// Very big photos are scaled down first. The limit stays high: the recognition model
// loses the spaces between words when letters are only a few pixels tall.
const maxSide = 4096

let service: Promise<PaddleOcrService> | null = null

function ready() {
  service ??= (async () => {
    const ocr = new PaddleOcrService({
      model: { detection, recognition, charactersDictionary: dictionary },
      session: { executionProviders: ['wasm'], graphOptimizationLevel: 'all' },
    })
    await ocr.initialize()
    return ocr
  })().catch((error: unknown) => {
    // Loading can fail while offline; the next picture tries again.
    service = null
    throw error
  })
  return service
}

export interface TextReader {
  /** The words on a picture with their places, or null when the models can't load. */
  read(picture: ImageBitmap): Promise<TextPage | null>
}

const reader: TextReader = {
  async read(picture) {
    const ocr = await ready().catch(() => null)
    if (!ocr) {
      picture.close()
      return null
    }
    const scale = Math.min(1, maxSide / Math.max(picture.width, picture.height))
    const width = Math.max(1, Math.round(picture.width * scale))
    const height = Math.max(1, Math.round(picture.height * scale))
    const canvas = new OffscreenCanvas(width, height)
    canvas.getContext('2d')?.drawImage(picture, 0, 0, width, height)
    picture.close()
    const result = await ocr.recognize(canvas)
    const words = result.lines.flat().map((word) => ({
      text: word.text,
      x: word.box.x,
      y: word.box.y,
      width: word.box.width,
      height: word.box.height,
      confidence: Math.min(1, Math.max(0, word.confidence)),
    }))
    return { width, height, words }
  },
}

expose(reader)
