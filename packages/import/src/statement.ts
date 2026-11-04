import { type InstallmentMark, labelWords, readMark } from './classifier/index.ts'
import type { Table } from './csv.ts'
import { type DateOrder, guessDateOrder, nameKey, readDate } from './values.ts'
import type { ColumnField, ColumnSettings } from './columns.ts'

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

/** A part of a page, in fractions of its width and height. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** The parts of a row the review draws boxes around. */
export type RowField = 'date' | 'payee' | 'amount' | 'installment'

/** Where a row came from, so the review can show its part of the page. */
export interface RowSource {
  page: number
  /** The whole row, across the table. */
  box: Box
  unsure: UnsureField[]
  /** Where each field was read, for the boxes over the statement. */
  fields?: Partial<Record<RowField, Box>>
  /** Where each amount cell was read, by the table's column; null where it is empty. */
  cells?: (Box | null)[]
  /** TXN-30: "MSI 03/12" in the description: month 3 of a 12-month plan. */
  installment?: InstallmentMark
  /** Reference and authorization numbers the description carried, kept as the note. */
  reference?: string
  /** IMP-09: the description says it is a payment received, such as "SU PAGO GRACIAS". */
  paid?: boolean
  /** The heading the row sits under: payments and deposits, or charges. */
  section?: 'in' | 'out'
}

/** Something the statement says about the wallet, where it says it (WAL-16). */
export interface StatementFact {
  /** A calendar date for the dates; the amount as written for the others. */
  value: string
  /** An amount the person entered, in minor units, instead of reading `value`. */
  minor?: number
  page: number
  box: Box
}

export interface StatementFacts {
  /** The day the statement closed (its cut-off). */
  closing: StatementFact | null
  /** The day the payment is due. */
  due: StatementFact | null
  limit: StatementFact | null
  minimum: StatementFact | null
  /** IMP-37: the balance the statement started from. */
  opening?: StatementFact | null
  /** IMP-37: where the closing balance is, for the statement view. */
  balance: StatementFact | null
  /** IMP-37: the statement's total of charges and withdrawals. */
  charges?: StatementFact | null
  /** IMP-37: its total of payments, deposits and credits. */
  credits?: StatementFact | null
}

/** Every fact a statement can give, in the order the review lists them. */
export const factKeys = [
  'charges',
  'credits',
  'opening',
  'balance',
  'closing',
  'due',
  'minimum',
  'limit',
] as const
export type FactKey = (typeof factKeys)[number]
/** The facts that are dates; the others are amounts. */
export const dateFacts: readonly FactKey[] = ['closing', 'due']

export function emptyFacts(): Required<StatementFacts> {
  return {
    closing: null,
    due: null,
    limit: null,
    minimum: null,
    opening: null,
    balance: null,
    charges: null,
    credits: null,
  }
}

export interface StatementTable extends Table {
  /** One per row, in the same order. */
  sources: RowSource[]
  /** IMP-37: the balances the statement shows, as written. */
  opening: string | null
  closing: string | null
  facts?: StatementFacts
}

/** Below this, a field is flagged instead of trusted (IMP-10; SYS-08 may make it a setting). */
export const defaultConfidence = 0.7

export interface Line {
  page: number
  words: TextWord[]
  top: number
  bottom: number
}

/**
 * Words on one line, left to right; runs a PDF item joined with wide gaps are split.
 * A photo is rarely straight, so lines are found along the page's slant; a line's top
 * and bottom are measured along it too, while its words keep their places on the page.
 */
export function linesOf(page: TextPage, index: number): Line[] {
  const words = page.words
    .flatMap((word) => splitWords(word))
    .filter((word) => word.text.trim() !== '')
  const slope = slantOf(words)
  const middle = page.width / 2
  const placed = words
    .map((word) => ({ word, top: word.y - slope * (word.x + word.width / 2 - middle) }))
    .sort((a, b) => a.top + a.word.height / 2 - (b.top + b.word.height / 2))
  const lines: Line[] = []
  for (const { word, top } of placed) {
    const center = top + word.height / 2
    const line = lines.at(-1)
    const lineMiddle = line ? (line.top + line.bottom) / 2 : 0
    if (line && Math.abs(center - lineMiddle) < Math.min(word.height, line.bottom - line.top) / 2) {
      line.words.push(word)
      line.top = Math.min(line.top, top)
      line.bottom = Math.max(line.bottom, top + word.height)
    } else lines.push({ page: index, words: [word], top, bottom: top + word.height })
  }
  for (const line of lines) line.words.sort((a, b) => a.x - b.x)
  return lines
}

/**
 * How much the text climbs or falls per pixel across. Each slope is tried in turn, and
 * the one that lines up the most pairs of words at the same height wins: on a straight
 * reading, words of one line sit level with each other.
 */
function slantOf(words: readonly TextWord[]): number {
  if (words.length < 3) return 0
  const level = (slope: number) => {
    const middles = words.map(
      (word) => word.y + word.height / 2 - slope * (word.x + word.width / 2),
    )
    let pairs = 0
    for (let a = 0; a < words.length; a += 1)
      for (let b = a + 1; b < words.length; b += 1) {
        const height = Math.min(words[a]?.height ?? 0, words[b]?.height ?? 0)
        if (Math.abs((middles[a] ?? 0) - (middles[b] ?? 0)) < height * 0.2) pairs += 1
      }
    return pairs
  }
  // Up to about six degrees either way, from straight outwards, so a tie stays straight.
  let best = 0
  let bestPairs = level(0)
  for (let step = 1; step <= 40; step += 1)
    for (const slope of [step * 0.0025, -step * 0.0025]) {
      const pairs = level(slope)
      if (pairs > bestPairs) {
        best = slope
        bestPairs = pairs
      }
    }
  return best
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
export function readDateText(written: string, year: number): string | null {
  // Text recognition reads the O of a month as a zero now and then: "09/0CT".
  const text = written.replace(/0(?=[A-Za-z]{2})|(?<=[A-Za-z])0(?=[A-Za-z])/g, 'O')
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
  const monthFirst = /^([A-Za-zÁÉÍÓÚáéíóú]{3,10})\.?\s*(\d{1,2}),?(?:\s+(\d{4}))?$/.exec(text)
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
  /saldo anterior|saldo inicial|adeudo anterior|adeudo del periodo anterior|opening balance|previous balance|beginning balance|balance forward/
const closingWords =
  /saldo final|saldo al corte|saldo actual|saldo deudor total|saldo nuevo|nuevo saldo|closing balance|new balance|ending balance/

// IMP-37: the labels of a statement's totals, at the start of their line. Like the
// balance labels, they name what statements say in English and Spanish, never a bank.
const chargesWords =
  /^(?:total (?:de )?)?(?:cargos|compras|retiros|consumos)(?: (?:y|e) (?:compras|cargos|retiros|otros cargos))?(?: (?:del periodo|regulares|no a meses|a meses))*\b|^total (?:charges|purchases|debits|withdrawals)\b|^(?:purchases|withdrawals|charges|debits)(?: and (?:other )?(?:charges|debits|adjustments))?\b/
const creditsWords =
  /^(?:total (?:de )?)?(?:pagos y abonos|pagos y creditos|depositos y abonos|abonos|depositos|pagos|creditos)\b|^total (?:payments|credits|deposits)\b|^(?:payments|deposits|credits)(?: and (?:other )?(?:credits|additions))?\b/

// IMP-09: how a statement thanks the person for a payment. Such a row is money in.
const paidWords =
  /\b(?:su pago|pago recibido|gracias por su pago|pago gracias|payment received|payment thank you|thank you for your payment|autopay payment)\b/

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
    section?: 'in' | 'out'
  }
  const found: Found[] = []
  const extra = new Map<Found, string[]>()
  let opening: string | null = null
  let closing: string | null = null
  // The heading the rows below sit under, such as "Pagos y abonos" or "Cargos".
  let section: 'in' | 'out' | undefined

  for (const { page, lines } of all) {
    let previous: Found | null = null
    let undated: Found[] = []
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
      // A heading is a short line with no date and no amount; a total beside a label
      // is a summary, which may sit anywhere, so it never starts a section.
      if (!date && !lastAmount && line.words.length <= 6) {
        if (creditsWords.test(text)) section = 'in'
        else if (chargesWords.test(text)) section = 'out'
      }
      if (date && amounts.length > 0) {
        const row: Found = {
          line,
          date: date.cell,
          dateWords: line.words.slice(0, date.used),
          description: rest.filter((word) => !isAmount(word.text)),
          amounts,
          ...(section ? { section } : {}),
        }
        // IMP-10: rows since the last one whose date couldn't be read sit between two
        // dated rows, so they are rows too; they go to the person to check.
        for (const waiting of undated) found.push(waiting)
        undated = []
        found.push(row)
        previous = row
        continue
      }
      const last = found.at(-1)
      const dateColumn = last?.dateWords[0]?.x
      const descriptionColumn = last?.description[0]?.x
      const near = (x: number | undefined, column: number | undefined) =>
        x !== undefined && column !== undefined && Math.abs(x - column) < page.width * 0.02
      if (
        !date &&
        amounts.length > 0 &&
        last?.line.page === line.page &&
        descriptionColumn !== undefined &&
        (near(line.words[0]?.x, dateColumn) || near(line.words[0]?.x, descriptionColumn)) &&
        !openingWords.test(text) &&
        !closingWords.test(text)
      ) {
        // The unreadable date is whatever sits before the description column, if anything.
        const start = descriptionColumn - page.width * 0.02
        const dateWords = line.words.filter((word) => word.x < start)
        const description = line.words.filter((word) => word.x >= start && !isAmount(word.text))
        // A total has no description of its own, so it is never taken for a row.
        if (description.length > 0 && !dateWords.some((word) => isAmount(word.text))) {
          const row: Found = {
            line,
            date: '',
            dateWords,
            description,
            amounts,
            ...(section ? { section } : {}),
          }
          undated.push(row)
          previous = row
          continue
        }
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

  // Headings are trusted only when the rows fall under both kinds: a label stacked over
  // its total in a summary looks like a heading, and would turn every row one way.
  const sectioned =
    found.some((row) => row.section === 'in') && found.some((row) => row.section === 'out')
  if (!sectioned) for (const row of found) delete row.section

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
    // IMP-08, TXN-30: the model splits the description into who was paid, an
    // installment mark and reference numbers; a mark that doesn't read as one stays
    // part of the payee.
    const read = readDescription([
      ...row.description,
      ...(extra.get(row) ?? []).flatMap((text) =>
        text.split(/\s+/).map((part) => ({ ...noWord, text: part })),
      ),
    ])
    rows.push([row.date, read.payee, ...cells])
    const said = nameKey(
      [...row.description.map((word) => word.text), ...(extra.get(row) ?? [])].join(' '),
    )
    const page = pages[row.line.page]
    const width = page?.width ?? 1
    const height = page?.height ?? 1
    const boxOf = (words: readonly TextWord[]) => {
      const placed = words.filter((word) => word.width > 0)
      if (placed.length === 0) return undefined
      const left = Math.min(...placed.map((word) => word.x))
      const top = Math.min(...placed.map((word) => word.y))
      return {
        x: left / width,
        y: top / height,
        width: (Math.max(...placed.map((word) => word.x + word.width)) - left) / width,
        height: (Math.max(...placed.map((word) => word.y + word.height)) - top) / height,
      }
    }
    const cellWords = centers.map(() => [] as TextWord[])
    for (const { word, right } of row.amounts) cellWords[columnOf(right)]?.push(word)
    const fields: Partial<Record<RowField, Box>> = {}
    const dateBox = boxOf(row.dateWords)
    const payeeBox = boxOf(read.payeeWords)
    const amountBox = boxOf(row.amounts.map((amount) => amount.word))
    const markBox = boxOf(read.markWords)
    if (dateBox) fields.date = dateBox
    if (payeeBox) fields.payee = payeeBox
    if (amountBox) fields.amount = amountBox
    if (markBox && read.installment) fields.installment = markBox
    // The whole width of the table, so a row shows the date or amount it is missing.
    const onPage = found.filter((other) => other.line.page === row.line.page)
    const left = Math.min(...onPage.flatMap((other) => other.line.words.map((word) => word.x)))
    const right = Math.max(
      ...onPage.flatMap((other) => other.line.words.map((word) => word.x + word.width)),
    )
    const unsure: UnsureField[] = []
    if (row.date === '' || Math.min(...row.dateWords.map((word) => word.confidence)) < threshold)
      unsure.push('date')
    if (amountConfidence < threshold) unsure.push('amount')
    // On a slanted photo the row covers more height than one line of text.
    const top = Math.min(...row.line.words.map((word) => word.y))
    const bottom = Math.max(
      ...row.line.words.map((word) => word.y + word.height),
      top + row.line.bottom - row.line.top,
    )
    sources.push({
      page: row.line.page,
      box: {
        x: left / width,
        y: top / height,
        width: (right - left) / width,
        height: (bottom - top) / height,
      },
      unsure,
      fields,
      // Date and description come first in the table, then one cell per amount column.
      cells: [null, null, ...cellWords.map((words) => boxOf(words) ?? null)],
      ...(read.installment ? { installment: read.installment } : {}),
      ...(read.reference ? { reference: read.reference } : {}),
      ...(paidWords.test(said) ? { paid: true } : {}),
      ...(row.section ? { section: row.section } : {}),
    })
  }
  const order = guessDateOrder(rows.map((row) => row[0] ?? ''))
  return {
    delimiter: '',
    header,
    rows,
    sources,
    opening,
    closing,
    facts: readFacts(all, pages, year, order),
  }
}

const noWord: TextWord = { text: '', x: 0, y: 0, width: 0, height: 0, confidence: 1 }

/** A row's description split by the word model (IMP-08, TXN-30). */
export function readDescription(words: readonly TextWord[]) {
  const labels = labelWords(words.map((word) => word.text))
  const markWords = words.filter((_, index) => labels[index] === 'installment')
  const installment = readMark(markWords.map((word) => word.text))
  const payeeWords = words.filter(
    (_, index) => labels[index] === 'payee' || (labels[index] === 'installment' && !installment),
  )
  const reference = words
    .filter((_, index) => labels[index] === 'reference')
    .map((word) => word.text)
    .join(' ')
  const join = (list: readonly TextWord[]) =>
    list
      .map((word) => word.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  return {
    // A description that is nothing but numbers keeps them, so the row has a name.
    payee: join(payeeWords) || join(words),
    payeeWords: payeeWords.length > 0 ? payeeWords : [...words],
    installment,
    markWords: installment ? markWords : [],
    reference,
  }
}

// WAL-16: the labels statements put next to these, in English and Spanish. Like the
// balance labels above, they name what a statement says, never a particular bank.
const factWords = {
  due: /fecha limite de pago|fecha limite|pagar antes de|limite de pago|payment due date|due date|pay by/,
  closing:
    /fecha de corte|fecha corte|dia de corte|closing date|statement closing date|statement date/,
  limit: /limite de credito|linea de credito|credit limit|credit line/,
  minimum: /pago minimo|minimum payment|minimum due|minimum amount due/,
} as const

/** WAL-16, IMP-37: the dates and amounts a statement gives about its wallet. */
function readFacts(
  all: readonly { page: TextPage; lines: Line[] }[],
  pages: readonly TextPage[],
  year: number,
  order: DateOrder,
): Required<StatementFacts> {
  const facts = emptyFacts()
  const fact = (line: Line, words: readonly TextWord[], value: string) =>
    factAt(pages, line.page, words, value)
  // IMP-37: totals by their label, so one repeated on another page counts once.
  const totals = { charges: [] as Total[], credits: [] as Total[] }
  for (const { lines } of all)
    for (const [position, line] of lines.entries()) {
      const text = nameKey(line.words.map((word) => word.text).join(' '))
      // The value sits after its label on the line, or right under it.
      const candidates = [line.words, lines[position + 1]?.words ?? []]
      for (const key of ['due', 'closing'] as const) {
        if (facts[key] || !factWords[key].test(text)) continue
        for (const words of candidates) {
          const found = dateIn(words, year, order)
          if (found) {
            facts[key] = fact(line, line.words, found)
            break
          }
        }
      }
      for (const key of ['limit', 'minimum'] as const) {
        if (facts[key] || !factWords[key].test(text)) continue
        const amount = line.words.find((word) => isAmount(word.text))
        if (amount) facts[key] = fact(line, line.words, amount.text)
      }
      const last = line.words.findLast((word) => isAmount(word.text))
      if (last && !facts.opening && openingWords.test(text))
        facts.opening = fact(line, line.words, last.text)
      if (last && !facts.balance && closingWords.test(text))
        facts.balance = fact(line, line.words, last.text)
      // A total is a label, then its amount; a line that starts with a date is a row.
      if (last && !dateAtStart(line.words, year)) {
        const label = line.words.filter((word) => !isAmount(word.text))
        const key = nameKey(label.map((word) => word.text).join(' '))
        for (const [name, words] of [
          ['credits', creditsWords],
          ['charges', chargesWords],
        ] as const)
          if (words.test(key) && label.length <= 8) {
            totals[name].push({ key, position, line, amount: last })
            break
          }
      }
      // "28 SEP – 27 OCT 2026": a statement's period ends on the day it closed.
      if (!facts.closing) {
        const dash = line.words.findIndex((word) => /^[-–—]$|^al$|^to$|^a$/i.test(word.text))
        if (dash > 0) {
          const after = dateIn(line.words.slice(dash + 1, dash + 4), year, order)
          const before = dateIn(line.words.slice(Math.max(0, dash - 3), dash), year, order)
          if (after && before && before < after) facts.closing = fact(line, line.words, after)
        }
      }
    }
  for (const name of ['charges', 'credits'] as const) {
    const found = totalOf(totals[name])
    if (found) facts[name] = { ...fact(found.line, found.words, found.value), minor: found.minor }
  }
  return facts
}

interface Total {
  key: string
  position: number
  line: Line
  amount: TextWord
}

/**
 * IMP-37: one total from the lines that carry its label. A line that says "total" is
 * the total; otherwise the summary splits it ("Cargos regulares", "Cargos a meses"),
 * so the lines close together in the first summary add up.
 */
function totalOf(found: readonly Total[]) {
  const seen = new Set<string>()
  const unique = found.filter((total) => !seen.has(total.key) && seen.add(total.key))
  const total = unique.find((item) => item.key.startsWith('total'))
  const first = unique[0]
  if (!first) return null
  const parts = total
    ? [total]
    : unique.filter(
        (item) => item.line.page === first.line.page && item.position - first.position <= 8,
      )
  let minor = 0
  for (const part of parts) {
    const digits = part.amount.text.replace(/[^\d]/g, '')
    if (digits === '') return null
    minor += Number(digits)
  }
  const [only] = parts
  return {
    line: parts.length === 1 && only ? only.line : { ...first.line },
    words: parts.flatMap((part) => part.line.words),
    value: parts.length === 1 && only ? only.amount.text : String(minor / 100),
    minor,
  }
}

/** A fact read from `words` on a page, boxed around them. */
function factAt(
  pages: readonly TextPage[],
  index: number,
  words: readonly TextWord[],
  value: string,
): StatementFact {
  const page = pages[index]
  const width = page?.width ?? 1
  const height = page?.height ?? 1
  const left = Math.min(...words.map((word) => word.x))
  const top = Math.min(...words.map((word) => word.y))
  return {
    value,
    page: index,
    box: {
      x: left / width,
      y: top / height,
      width: (Math.max(...words.map((word) => word.x + word.width)) - left) / width,
      height: (Math.max(...words.map((word) => word.y + word.height)) - top) / height,
    },
  }
}

/** The fact a label names, if any, from the words of a line or a box around it. */
export function factNamed(label: string): FactKey | null {
  const key = nameKey(label)
  if (key === '') return null
  if (creditsWords.test(key)) return 'credits'
  if (chargesWords.test(key)) return 'charges'
  if (openingWords.test(key)) return 'opening'
  if (closingWords.test(key)) return 'balance'
  for (const name of ['due', 'closing', 'limit', 'minimum'] as const)
    if (factWords[name].test(key)) return name
  return null
}

/**
 * IMP-14, IMP-37: a fact found by a label the person showed on an earlier statement
 * of the same layout, such as "TOTAL CARGOS DEL PERIODO": the line that starts with
 * it, and the date or amount after it there or on the line below.
 */
export function findLabeled(
  pages: readonly TextPage[],
  key: FactKey,
  label: string,
  options: { year: number; order: DateOrder },
): StatementFact | null {
  const wanted = nameKey(label)
  if (wanted === '') return null
  for (const [index, page] of pages.entries()) {
    const lines = linesOf(page, index)
    for (const [position, line] of lines.entries()) {
      const text = nameKey(line.words.map((word) => word.text).join(' '))
      if (!text.includes(wanted)) continue
      for (const words of [line.words, lines[position + 1]?.words ?? []]) {
        if (dateFacts.includes(key)) {
          const date = dateIn(words, options.year, options.order)
          if (date) return factAt(pages, index, line.words, date)
        } else {
          const amount = words.findLast((word) => isAmount(word.text))
          if (amount) return factAt(pages, index, line.words, amount.text)
        }
      }
    }
  }
  return null
}

/** The first date in a run of words, as a calendar date. */
function dateIn(words: readonly TextWord[], year: number, order: DateOrder): string | null {
  for (let start = 0; start < words.length; start += 1)
    for (let used = Math.min(3, words.length - start); used >= 1; used -= 1) {
      const text = words
        .slice(start, start + used)
        .map((word) => word.text)
        .join(' ')
      const cell = readDateText(text, year)
      const date = cell === null ? null : /^\d{4}-/.test(cell) ? cell : readDate(cell, order)
      if (date) return date
    }
  return null
}

/**
 * IMP-04: a row the reader missed, from the words inside a box the person drew around
 * it on the page. Dates and amounts are found wherever they are in the box.
 */
export function readBox(
  page: TextPage,
  box: Box,
  options: { year: number; order?: DateOrder },
): {
  date: string | null
  payee: string
  amount: string | null
  installment: InstallmentMark | null
} {
  const inside = page.words
    .flatMap((word) => splitWords(word))
    .filter((word) => {
      const x = (word.x + word.width / 2) / page.width
      const y = (word.y + word.height / 2) / page.height
      return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)
  const order = options.order ?? 'dmy'
  let date: string | null = null
  let used = new Set<TextWord>()
  for (let start = 0; start < inside.length && date === null; start += 1)
    for (let count = Math.min(3, inside.length - start); count >= 1; count -= 1) {
      const words = inside.slice(start, start + count)
      const found = dateIn(words, options.year, order)
      if (found && readDateText(words.map((word) => word.text).join(' '), options.year)) {
        date = found
        used = new Set(words)
        break
      }
    }
  const amount = inside.findLast((word) => isAmount(word.text)) ?? null
  const rest = inside.filter((word) => !used.has(word) && !isAmount(word.text))
  const read = readDescription(rest)
  return {
    date,
    payee: read.payee,
    amount: amount?.text ?? null,
    installment: read.installment,
  }
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

/**
 * IMP-01: several files read as one import, such as screenshots of the same app's
 * list. Each file is read on its own, since layouts differ from file to file; they join
 * only when they have the same columns, so the wizard can read every row the same way.
 */
export function joinStatements(
  files: readonly { table: StatementTable; pages: number }[],
): StatementTable | null {
  const [first] = files
  if (!first) return null
  if (files.some((file) => file.table.header.length !== first.table.header.length)) return null
  let offset = 0
  const sources: RowSource[] = []
  const facts = emptyFacts()
  for (const file of files) {
    for (const source of file.table.sources) sources.push({ ...source, page: source.page + offset })
    // WAL-16: what any of the files says, on its own page of the whole.
    for (const key of factKeys) {
      const found = file.table.facts?.[key]
      if (!facts[key] && found) facts[key] = { ...found, page: found.page + offset }
    }
    offset += file.pages
  }
  return {
    delimiter: '',
    header: first.table.header,
    rows: files.flatMap((file) => file.table.rows),
    sources,
    opening: files.length === 1 ? first.table.opening : null,
    closing: files.length === 1 ? first.table.closing : null,
    facts,
  }
}

const amountFields: readonly ColumnField[] = ['amount', 'inflow', 'outflow']

/**
 * IMP-40: where each field of a row was read, with the amount boxed only over the
 * columns that hold one, so a running balance beside it is left out.
 */
export function fieldsOf(source: RowSource, settings: ColumnSettings) {
  const fields = { ...source.fields }
  if (source.cells) {
    const boxes = source.cells.filter(
      (box, index): box is Box =>
        box !== null && amountFields.includes(settings.columns[index] ?? 'skip'),
    )
    if (boxes.length > 0) fields.amount = unionOf(boxes)
    else delete fields.amount
  }
  return fields
}

function unionOf(boxes: readonly Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  }
}
