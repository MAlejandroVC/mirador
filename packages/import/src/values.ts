import { fractionDigits } from '@repo/core'

// IMP-08: reading a cell as a calendar date or an amount. Files write both in many
// ways, so the way a file writes them is guessed from all its cells at once, never one
// cell alone: "03/04/2026" is only clear next to "25/04/2026".

/** The order of day, month and year in a date that isn't ISO. */
export type DateOrder = 'ymd' | 'dmy' | 'mdy'

const dateParts = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})(?:[T\s].*)?$/

export function guessDateOrder(values: readonly string[]): DateOrder {
  let dmy = 0
  let mdy = 0
  for (const value of values) {
    const match = dateParts.exec(value.trim())
    if (!match) continue
    const [, a = '', b = ''] = match
    if (a.length === 4) return 'ymd'
    if (Number(a) > 12) dmy += 1
    if (Number(b) > 12) mdy += 1
  }
  // Day first is what most of the world writes, the app's first users included.
  return mdy > dmy ? 'mdy' : 'dmy'
}

/** The date as YYYY-MM-DD, or null when it isn't a real one. */
export function readDate(text: string, order: DateOrder): string | null {
  const match = dateParts.exec(text.trim())
  if (!match) return null
  const [, a = '', b = '', c = ''] = match
  let year: number
  let month: number
  let day: number
  if (a.length === 4) [year, month, day] = [Number(a), Number(b), Number(c)]
  else if (order === 'mdy') [month, day, year] = [Number(a), Number(b), Number(c)]
  else [day, month, year] = [Number(a), Number(b), Number(c)]
  if (c.length === 2 && a.length !== 4) year += 2000
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null
  return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** The character a file uses between whole units and cents. */
export type DecimalMark = '.' | ','

export function guessDecimalMark(values: readonly string[]): DecimalMark {
  let comma = 0
  let point = 0
  for (const value of values) {
    const text = value.trim()
    const lastComma = text.lastIndexOf(',')
    const lastPoint = text.lastIndexOf('.')
    if (lastComma > lastPoint && /,\d{1,2}\)?-?$/.test(text)) comma += 1
    else if (lastPoint > lastComma && /\.\d{1,2}\)?-?$/.test(text)) point += 1
    // "1.234.567" can only use points for thousands.
    else if (/\d\.\d{3}\.\d{3}/.test(text)) comma += 1
  }
  return comma > point ? ',' : '.'
}

/**
 * The amount as signed minor units of `currency`, or null when the cell isn't one or
 * has more decimals than the currency. Symbols and spaces are ignored; "(12.00)" and
 * "12.00-" are negative, as accounting writes them. No float on the way (Money rule).
 */
export function readAmount(text: string, mark: DecimalMark, currency: string): number | null {
  let cleaned = text.replace(/[\s\u00a0\u202f]/g, '')
  if (cleaned === '') return null
  let negative = false
  if (/^\(.*\)$/.test(cleaned)) {
    negative = true
    cleaned = cleaned.slice(1, -1)
  }
  if (cleaned.endsWith('-')) {
    negative = true
    cleaned = cleaned.slice(0, -1)
  }
  cleaned = cleaned.replace(/^[^\d\-+.,]+|[^\d.,]+$/g, '')
  if (cleaned.startsWith('-') || cleaned.startsWith('\u2212')) {
    negative = !negative
    cleaned = cleaned.slice(1)
  } else if (cleaned.startsWith('+')) cleaned = cleaned.slice(1)
  cleaned = cleaned.replace(/^[^\d.,]+/, '')
  const group = mark === '.' ? ',' : '.'
  const [whole = '', fraction = '', ...rest] = cleaned.replaceAll(group, '').split(mark)
  if (rest.length > 0 || !/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) return null
  if (whole === '' && fraction === '') return null
  const digits = fractionDigits(currency)
  if (fraction.length > digits) return null
  const minor = Number(`${whole || '0'}${fraction.padEnd(digits, '0')}`)
  if (!Number.isSafeInteger(minor)) return null
  return negative && minor !== 0 ? -minor : minor
}

/** Cells with several tags, such as "work, trip" or "work|trip". */
export function readTags(text: string): string[] {
  return text
    .split(/[,|;#]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '')
}

/** A name compared without case, accents or punctuation, so "Súper" finds "super". */
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
