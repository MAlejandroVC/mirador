import type { Table } from './csv.ts'
import { nameKey } from './values.ts'

// IMP-04, IMP-05, IMP-08: a statement read from text with positions, from a text PDF
// (pdf.js in the browser) or from the server's OCR of a picture or a scanned page. The
// rows become the same table a CSV gives, so the import wizard reads, remembers
// (IMP-02, IMP-03), matches and reviews them the same way.

/** A word or a run of words, placed on its page. Coordinates are from the top left. */
export interface TextWord {
  text: string
  x: number
  y: number
  width: number
  height: number
  /** 0 to 1; text from a PDF's own text is 1. */
  confidence: number
}

export interface TextPage {
  width: number
  height: number
  words: TextWord[]
}

/** A field of a row that was hard to read (IMP-10). */
export type UnsureField = 'date' | 'amount'

/** Where a row came from, so the review can show its part of the page. */
export interface RowSource {
  page: number
  /** Fractions of the page's width and height. */
  box: { x: number; y: number; width: number; height: number }
  unsure: UnsureField[]
}

export interface StatementTable extends Table {
  /** One per row, in the same order. */
  sources: RowSource[]
  /** IMP-37: the balances the statement shows, as written. */
  opening: string | null
  closing: string | null
}

/** Below this, a field is flagged instead of trusted (IMP-10; SYS-08 may make it a setting). */
export const defaultConfidence = 0.7

export interface Line {
  page: number
  words: TextWord[]
  top: number
  bottom: number
}

/** Words on one line, left to right; runs a PDF item joined with wide gaps are split. */
export function linesOf(page: TextPage, index: number): Line[] {
  const words = page.words
    .flatMap((word) => splitWords(word))
    .filter((word) => word.text.trim() !== '')
    .sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2))
  const lines: Line[] = []
  for (const word of words) {
    const middle = word.y + word.height / 2
    const line = lines.at(-1)
    const lineMiddle = line ? (line.top + line.bottom) / 2 : 0
    if (line && Math.abs(middle - lineMiddle) < Math.min(word.height, line.bottom - line.top) / 2) {
      line.words.push(word)
      line.top = Math.min(line.top, word.y)
      line.bottom = Math.max(line.bottom, word.y + word.height)
    } else lines.push({ page: index, words: [word], top: word.y, bottom: word.y + word.height })
  }
  for (const line of lines) line.words.sort((a, b) => a.x - b.x)
  return lines
}

/**
 * Each word on its own, placed by its share of the run: a PDF often draws a whole row
 * as one run, and OCR may read "TOTAL $248.50" as one.
 */
function splitWords(word: TextWord): TextWord[] {
  const parts = word.text.split(/(\s+)/)
  if (parts.length === 1) return [word]
  const perChar = word.width / Math.max(1, word.text.length)
  const out: TextWord[] = []
  let offset = 0
  for (const part of parts) {
    if (part.trim() !== '')
      out.push({ ...word, text: part, x: word.x + offset * perChar, width: part.length * perChar })
    offset += part.length
  }
  return out
}

const months: Record<string, number> = {
  jan: 1,
  ene: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  ago: 8,
  sep: 9,
  set: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  dic: 12,
}

function monthOf(text: string): number | null {
  return months[nameKey(text).slice(0, 3)] ?? null
}

/** A date at the start of a line, as a cell readDate understands, and the words it took. */
export function dateAtStart(
  words: readonly TextWord[],
  year: number,
): { cell: string; used: number } | null {
  for (let used = Math.min(3, words.length); used >= 1; used -= 1) {
    const text = words
      .slice(0, used)
      .map((word) => word.text)
      .join(' ')
      .trim()
    const cell = readDateText(text, year)
    if (cell) return { cell, used }
  }
  return null
}

/** "14/10/2026", "14/10", "2026-10-14", "14 OCT", "14/OCT/26", "Oct 14, 2026". */
export function readDateText(text: string, year: number): string | null {
  const numeric = /^(\d{1,4})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/.exec(text)
  if (numeric) {
    const [, a = '', b = '', c] = numeric
    if (a.length === 4) return c ? `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}` : null
    if (a.length > 2) return null
    // The order (day or month first) is left to the column, as for a CSV.
    return `${a}/${b}/${c ?? String(year)}`
  }
  const dayFirst = /^(\d{1,2})[\s/.-]*([A-Za-zÁÉÍÓÚáéíóú]{3,10})\.?(?:[\s/.,-]+(\d{2,4}))?$/.exec(
    text,
  )
  const monthFirst = /^([A-Za-zÁÉÍÓÚáéíóú]{3,10})\.?\s+(\d{1,2}),?(?:\s+(\d{4}))?$/.exec(text)
  const parts = dayFirst
    ? { day: dayFirst[1], month: dayFirst[2], year: dayFirst[3] }
    : monthFirst
      ? { day: monthFirst[2], month: monthFirst[1], year: monthFirst[3] }
      : null
  if (!parts?.day || !parts.month) return null
  const month = monthOf(parts.month)
  if (month === null) return null
  let full = parts.year ? Number(parts.year) : year
  if (full < 100) full += 2000
  return `${String(full)}-${String(month).padStart(2, '0')}-${parts.day.padStart(2, '0')}`
}

const amountPattern =
  /^[-+−(]?\s?(?:[A-Z]{3}\s?)?\$?\s?(?:\d{1,3}(?:[,.\s]\d{3})+|\d+)[.,]\d{2}\)?(?:-|\s?CR)?$/

/** A money amount with cents, as statements write them; plain numbers are references. */
export function isAmount(text: string): boolean {
  return amountPattern.test(text.trim())
}

/** The year most dates on the statement use, for rows that leave it out. */
function statementYear(lines: readonly Line[], fallback: number): number {
  const counts = new Map<number, number>()
  for (const line of lines)
    for (const word of line.words)
      for (const match of word.text.matchAll(/(?:^|\D)(20\d{2})(?:\D|$)/g)) {
        const value = Number(match[1])
        counts.set(value, (counts.get(value) ?? 0) + 1)
      }
  let best = fallback
  let bestCount = 0
  for (const [value, count] of counts)
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  return best
}

const openingWords =
  /saldo anterior|saldo inicial|opening balance|previous balance|beginning balance|balance forward/
const closingWords =
  /saldo final|saldo al corte|saldo actual|closing balance|new balance|ending balance/

/**
 * The transactions of a statement as a table: a date at the start of a line and at
 * least one amount make a row; amounts fall into columns by where they end, named by
 * the header above them; a line of text right under a row continues its description.
 * `year` fills dates that leave it out when the statement never says it.
 */
export function readStatement(
  pages: readonly TextPage[],
  options: { year: number; confidence?: number },
): StatementTable {
  const threshold = options.confidence ?? defaultConfidence
  const all = pages.map((page, index) => ({ page, lines: linesOf(page, index) }))
  const year = statementYear(
    all.flatMap((entry) => entry.lines),
    options.year,
  )

  interface Found {
    line: Line
    date: string
    dateWords: TextWord[]
    description: TextWord[]
    amounts: { word: TextWord; right: number }[]
  }
  const found: Found[] = []
  const extra = new Map<Found, string[]>()
  let opening: string | null = null
  let closing: string | null = null

  for (const { page, lines } of all) {
    let previous: Found | null = null
    for (const line of lines) {
      const text = nameKey(line.words.map((word) => word.text).join(' '))
      const lastAmount = line.words.findLast((word) => isAmount(word.text))?.text ?? null
      if (lastAmount && opening === null && openingWords.test(text)) opening = lastAmount
      if (lastAmount && closing === null && closingWords.test(text)) closing = lastAmount
      const date = dateAtStart(line.words, year)
      const rest = date ? line.words.slice(date.used) : line.words
      const amounts = rest
        .filter((word) => isAmount(word.text))
        .map((word) => ({ word, right: (word.x + word.width) / page.width }))
      if (date && amounts.length > 0) {
        const row: Found = {
          line,
          date: date.cell,
          dateWords: line.words.slice(0, date.used),
          description: rest.filter((word) => !isAmount(word.text)),
          amounts,
        }
        found.push(row)
        previous = row
        continue
      }
      // A description that wraps onto the next line, right under its row.
      const height = line.bottom - line.top
      const indent = (previous?.description[0]?.x ?? 0) - page.width * 0.02
      if (
        previous &&
        !date &&
        amounts.length === 0 &&
        line.top - previous.line.bottom < height * 1.2 &&
        (line.words[0]?.x ?? 0) >= indent
      ) {
        const text = line.words.map((word) => word.text).join(' ')
        extra.set(previous, [...(extra.get(previous) ?? []), text])
        previous.line = { ...previous.line, bottom: line.bottom }
      } else previous = null
    }
  }

  // Amount columns: amounts that end at about the same place on the page.
  const rights = found
    .flatMap((row) => row.amounts.map((amount) => amount.right))
    .sort((a, b) => a - b)
  const columns: number[][] = []
  for (const right of rights) {
    const column = columns.at(-1)
    if (column && right - (column.at(-1) ?? 0) < 0.04) column.push(right)
    else columns.push([right])
  }
  const centers = columns.map(
    (column) => column.reduce((sum, value) => sum + value, 0) / column.length,
  )
  const columnOf = (right: number) => {
    let best = 0
    for (let index = 1; index < centers.length; index += 1)
      if (Math.abs((centers[index] ?? 0) - right) < Math.abs((centers[best] ?? 0) - right))
        best = index
    return best
  }

  const names = headerNames(
    all,
    found.at(0)?.line ?? null,
    centers,
    found.at(0)?.description[0]?.x ?? null,
  )
  const header = [names.date, names.description, ...names.amounts]
  const rows: string[][] = []
  const sources: RowSource[] = []
  for (const row of found) {
    const cells = new Array<string>(centers.length).fill('')
    let amountConfidence = 1
    for (const { word, right } of row.amounts) {
      const index = columnOf(right)
      cells[index] = cells[index] ? `${cells[index]} ${word.text}` : word.text
      amountConfidence = Math.min(amountConfidence, word.confidence)
    }
    const description = [
      row.description.map((word) => word.text).join(' '),
      ...(extra.get(row) ?? []),
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    rows.push([row.date, description, ...cells])
    const page = pages[row.line.page]
    const width = page?.width ?? 1
    const height = page?.height ?? 1
    const left = Math.min(...row.line.words.map((word) => word.x))
    const right = Math.max(...row.line.words.map((word) => word.x + word.width))
    const unsure: UnsureField[] = []
    if (Math.min(...row.dateWords.map((word) => word.confidence)) < threshold) unsure.push('date')
    if (amountConfidence < threshold) unsure.push('amount')
    sources.push({
      page: row.line.page,
      box: {
        x: left / width,
        y: row.line.top / height,
        width: (right - left) / width,
        height: (row.line.bottom - row.line.top) / height,
      },
      unsure,
    })
  }
  return { delimiter: '', header, rows, sources, opening, closing }
}

/** The header line over the first row, its words matched to the columns under them. */
function headerNames(
  all: readonly { page: TextPage; lines: Line[] }[],
  first: Line | null,
  centers: readonly number[],
  descriptionStart: number | null,
) {
  const fallback = {
    date: 'Date',
    description: 'Description',
    amounts: centers.map((_, index) =>
      centers.length === 1 ? 'Amount' : `Amount ${String(index + 1)}`,
    ),
  }
  if (!first) return fallback
  const entry = all[first.page]
  if (!entry) return fallback
  const above = entry.lines
    .filter((line) => line.bottom <= first.top)
    .slice(-3)
    .reverse()
  const header = above.find(
    (line) => line.words.length >= 2 && !line.words.some((word) => isAmount(word.text)),
  )
  if (!header) return fallback
  const width = entry.page.width
  const amounts = centers.map((center, index) => {
    // The header word whose right edge (amounts are right-aligned) is closest.
    let best: TextWord | null = null
    let bestGap = 0.08
    for (const word of header.words) {
      const gap = Math.abs((word.x + word.width) / width - center)
      if (gap < bestGap) {
        best = word
        bestGap = gap
      }
    }
    return best?.text ?? fallback.amounts[index] ?? 'Amount'
  })
  // The date's and the description's names: the header words over where they start.
  const nearest = (x: number) =>
    header.words.reduce<TextWord | null>(
      (best, word) => (!best || Math.abs(word.x - x) < Math.abs(best.x - x) ? word : best),
      null,
    )
  const date = nearest(first.words[0]?.x ?? 0)
  const start = descriptionStart ?? first.words[1]?.x ?? 0
  const description = nearest(start)
  return {
    date: date?.text ?? fallback.date,
    description:
      description && description !== date && !amounts.includes(description.text)
        ? description.text
        : fallback.description,
    amounts,
  }
}
