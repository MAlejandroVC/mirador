import { type OcrError, ocrResponse } from '@repo/api'
import type { TextPage } from '@repo/import'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// IMP-04, IMP-05, IMP-07, IMP-11, SEC-05: turning PDFs and pictures into words with
// their places, for packages/import to read. A text PDF is read here on the device;
// a picture or a scanned page is made into a JPEG here and read by the person's own
// server, in memory. Nothing goes anywhere else.

GlobalWorkerOptions.workerSrc = pdfWorker

/** Why a file couldn't be read, for the message the person sees. */
export class ReadingError extends Error {
  constructor(readonly reason: 'unreadable' | 'unavailable' | 'offline') {
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

// Big enough to read small print, small enough to send quickly from a phone.
const maxSide = 4096

/**
 * The picture as a JPEG at most `maxSide` wide or tall. The browser decodes it, so a
 * HEIC photo works wherever the browser shows HEIC (Safari); the server never sees one.
 */
export async function preparePicture(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob).catch(() => {
    throw new ReadingError('unreadable')
  })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return toJpeg(canvas)
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

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** SEC-05: the server reads the JPEG in memory and answers with its words. */
export async function readOnServer(jpeg: Blob, fetchFn: typeof fetch = fetch): Promise<TextPage> {
  // The server reads one picture at a time and asks the rest to come back shortly.
  for (let attempt = 0; ; attempt += 1) {
    let response: Response
    try {
      response = await fetchFn('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: jpeg,
        credentials: 'same-origin',
      })
    } catch {
      throw new ReadingError('offline')
    }
    if (response.ok) return ocrResponse.parse(await response.json())
    const body = (await response.json().catch(() => null)) as OcrError | null
    if (body?.error === 'busy' && attempt < 15) {
      await wait(2000)
      continue
    }
    throw new ReadingError(body?.error === 'ocr-unavailable' ? 'unavailable' : 'unreadable')
  }
}

/** A photo, a screenshot or a scan: one page. */
export async function readPicture(file: Blob): Promise<ReadPage> {
  const jpeg = await preparePicture(file)
  const page = await readOnServer(jpeg)
  return { ...page, image: URL.createObjectURL(jpeg) }
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
      }
      onPage?.(number, pdf.numPages)
    }
  } finally {
    void task.destroy()
  }
  return pages
}
