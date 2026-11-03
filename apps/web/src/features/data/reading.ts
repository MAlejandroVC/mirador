import type { TextPage } from '@repo/import'
import { transfer, wrap } from 'comlink'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { TextReader } from './ocr/ocr.worker'

// IMP-04, IMP-05, IMP-07, IMP-11: turning PDFs and pictures into words with their
// places, for packages/import to read. Everything happens here on the device: a text
// PDF's words come straight from the file, and pictures and scanned pages are read by
// the text recognition worker. No file or picture is sent anywhere.

GlobalWorkerOptions.workerSrc = pdfWorker

/** Why a file couldn't be read, for the message the person sees. */
export class ReadingError extends Error {
  constructor(readonly reason: 'unreadable' | 'unavailable') {
    super(reason)
  }
}

export interface ReadPage extends TextPage {
  /** A picture of the page, to show the part of a row that was hard to read. */
  image: string | null
}

export function isPdf(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export function isPicture(file: File) {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)
}

let reader: TextReader | null = null

/** The text recognition worker, started the first time a picture is read. */
function textReader() {
  reader ??= wrap<TextReader>(
    new Worker(new URL('./ocr/ocr.worker.ts', import.meta.url), { type: 'module' }),
  )
  return reader
}

/** The words on a picture, read on this device. */
async function readText(picture: ImageBitmap): Promise<TextPage> {
  let page: TextPage | null
  try {
    page = await textReader().read(transfer(picture, [picture]))
  } catch {
    throw new ReadingError('unreadable')
  }
  // The models couldn't load, which needs a connection the first time.
  if (!page) throw new ReadingError('unavailable')
  return page
}

/**
 * A photo, a screenshot or a scan: one page. The browser decodes it, so a HEIC photo
 * works wherever the browser shows HEIC (Safari), and the picture shown next to a row
 * to check is the file itself.
 */
export async function readPicture(file: Blob): Promise<ReadPage> {
  const picture = await createImageBitmap(file).catch(() => {
    throw new ReadingError('unreadable')
  })
  const page = await readText(picture)
  return { ...page, image: URL.createObjectURL(file) }
}

function toJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result)
        else reject(new ReadingError('unreadable'))
      },
      'image/jpeg',
      0.9,
    )
  })
}

/**
 * IMP-04: a text PDF's words straight from the file; a page without text (a scan) is
 * drawn and read like a picture (IMP-05).
 */
export async function readPdf(file: Blob, onPage?: (done: number, total: number) => void) {
  const data = new Uint8Array(await file.arrayBuffer())
  const task = getDocument({ data })
  const pdf = await task.promise.catch(() => {
    throw new ReadingError('unreadable')
  })
  const pages: ReadPage[] = []
  try {
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const words = content.items.flatMap((item) => {
        if (!('str' in item) || item.str.trim() === '') return []
        const [, , , , left = 0, baseline = 0] = item.transform as number[]
        const [x, y] = viewport.convertToViewportPoint(left, baseline) as [number, number]
        const height = item.height || 10
        return [{ text: item.str, x, y: y - height, width: item.width, height, confidence: 1 }]
      })
      if (words.length >= 5) {
        pages.push({ width: viewport.width, height: viewport.height, words, image: null })
      } else {
        // A scanned page: drawn at twice its size so small print stays readable.
        const scaled = page.getViewport({ scale: 2 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(scaled.width)
        canvas.height = Math.round(scaled.height)
        const context = canvas.getContext('2d')
        if (!context) throw new ReadingError('unreadable')
        await page.render({ canvas, canvasContext: context, viewport: scaled }).promise
        pages.push(await readPicture(await toJpeg(canvas)))
        canvas.width = 0
      }
      onPage?.(number, pdf.numPages)
    }
  } finally {
    void task.destroy()
  }
  return pages
}
