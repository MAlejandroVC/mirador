import { z } from 'zod'

// POST /api/ocr (IMP-05, IMP-07, IMP-11, SEC-05): the body is one picture, a photo, a
// screenshot or a page of a scanned PDF drawn by the browser. The server reads it in
// memory and answers with the words it found and where; it keeps nothing. Everything
// else (which words are a date, an amount or a shop) happens back in the browser.

/** What the browser sends: it turns HEIC and PDF pages into JPEG first. */
export const ocrImageTypes = ['image/jpeg', 'image/png', 'image/webp'] as const

/** A phone photo, downscaled by the browser, is far smaller; this only stops abuse. */
export const maxOcrBytes = 12 * 1024 * 1024

export const ocrWord = z.object({
  text: z.string().max(500),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
})

export const ocrResponse = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  words: z.array(ocrWord).max(20_000),
})

export type OcrWord = z.infer<typeof ocrWord>
export type OcrResponse = z.infer<typeof ocrResponse>

export interface OcrError {
  error:
    | 'not-an-image'
    | 'too-large'
    | 'unreadable'
    // The server runs without its text-recognition models (a development setup).
    | 'ocr-unavailable'
    // Too many pictures waiting already; the browser tries again shortly.
    | 'busy'
}
