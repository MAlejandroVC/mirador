import { nameKey } from '../values.ts'

// What the statement models look at. Nothing here names a bank: the models learn which
// words and shapes go with which role from synthetic statements in many layouts
// (synthetic.ts), so a bank nobody wrote a rule for reads the same way.

/** What a word in a row's description is (IMP-08, TXN-30). */
export const wordLabels = ['payee', 'installment', 'reference'] as const
export type WordLabel = (typeof wordLabels)[number]

/** What an amount column of a statement holds (IMP-04). */
export const columnLabels = ['signed', 'charges', 'outflow', 'inflow', 'balance'] as const
export type ColumnLabel = (typeof columnLabels)[number]

const buckets = 32

/** FNV-1a, folded into a few buckets: words the models learned land in their place. */
export function bucketOf(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % buckets
}

/** A word as the models see it: digits become 0s, so "03/12" and "04/06" look alike. */
export function shapeOf(word: string): string {
  const key = nameKey(word)
  return /\d/.test(word) ? word.replace(/\d/g, '0').replace(/[^0/*#-]/g, 'a') : key
}

const fraction = /^\(?(\d{1,2})\/(\d{1,2})\)?$/
const commonMonths = new Set([2, 3, 4, 5, 6, 9, 10, 12, 13, 15, 18, 20, 24, 30, 36, 48, 60])

function shapeFlags(word: string | undefined) {
  if (word === undefined) return { fraction: 0, small: 0, long: 0 }
  return {
    fraction: fraction.test(word) ? 1 : 0,
    small: /^\d{1,2}$/.test(word) ? 1 : 0,
    long: /^\D{0,2}\d{5,}$/.test(word) ? 1 : 0,
  }
}

export const wordFeatureCount = 20 + buckets * 3

/** The features of `words[index]`, with its neighbours for context. */
export function wordFeatures(words: readonly string[], index: number): number[] {
  const word = words[index] ?? ''
  const features = new Array<number>(wordFeatureCount).fill(0)
  const parts = fraction.exec(word)
  const month = parts ? Number(parts[1]) : 0
  const months = parts ? Number(parts[2]) : 0
  const digits = word.replace(/\D/g, '').length
  const letters = word.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '').length
  const here = shapeFlags(word)
  const before = shapeFlags(words[index - 1])
  const after = shapeFlags(words[index + 1])
  const last = words.length - 1
  ;[
    here.fraction,
    parts && month >= 1 && month <= months && months >= 2 ? 1 : 0,
    commonMonths.has(months) ? 1 : 0,
    here.small,
    here.long,
    word.length === 0 ? 0 : digits / word.length,
    letters > 0 ? 1 : 0,
    letters === word.length ? 1 : 0,
    letters > 0 && digits > 0 ? 1 : 0,
    /^[*#]/.test(word) ? 1 : 0,
    Math.min(1, word.length / 12),
    last <= 0 ? 0 : index / last,
    index === last ? 1 : 0,
    index === 0 ? 1 : 0,
    before.fraction,
    after.fraction,
    before.small,
    after.small,
    before.long,
    after.long,
  ].forEach((value, position) => {
    features[position] = value
  })
  const at = (offset: number, text: string | undefined) => {
    features[20 + offset * buckets + bucketOf(text === undefined ? '^$' : shapeOf(text))] = 1
  }
  at(0, word)
  at(1, words[index - 1])
  at(2, words[index + 1])
  return features
}

/** One amount column of a statement, with the others beside it. */
export interface ColumnSample {
  header: string
  /** Signed values in minor units, null where the cell is empty or unreadable. */
  values: readonly (number | null)[]
  /** Cells marked as credits ("CR"), which go the other way. */
  credits: readonly boolean[]
  others: readonly (readonly (number | null)[])[]
  /** Its place among the amount columns, from the left. */
  position: number
}

export const columnFeatureCount = 13 + buckets

export function columnFeatures(column: ColumnSample): number[] {
  const features = new Array<number>(columnFeatureCount).fill(0)
  const rows = column.values.length
  const filled = column.values.filter((value): value is number => value !== null)
  const share = (count: number, of: number) => (of === 0 ? 0 : count / of)
  const negative = filled.filter((value) => value < 0).length
  const credits = column.credits.filter(Boolean).length
  // A running balance: each value is the last one plus or minus another cell of its row.
  let running = 0
  let pairs = 0
  for (let index = 1; index < rows; index += 1) {
    const now = column.values[index]
    const then = column.values[index - 1]
    if (now === null || now === undefined || then === null || then === undefined) continue
    pairs += 1
    const step = Math.abs(now - then)
    if (column.others.some((other) => Math.abs(Math.abs(other[index] ?? 0) - step) <= 1))
      running += 1
  }
  // Rows where only this column has a value: debit and credit columns take turns.
  let alone = 0
  for (let index = 0; index < rows; index += 1)
    if (
      column.values[index] !== null &&
      column.others.every((other) => other[index] === null || other[index] === undefined)
    )
      alone += 1
  const count = column.others.length + 1
  const mean = (values: readonly (number | null)[]) => {
    const own = values.filter((value): value is number => value !== null)
    return own.length === 0 ? 0 : own.reduce((sum, value) => sum + Math.abs(value), 0) / own.length
  }
  const means = [mean(column.values), ...column.others.map(mean)]
  const larger = means.filter((value) => value > (means[0] ?? 0)).length
  ;[
    share(filled.length, rows),
    share(negative, filled.length),
    share(credits, filled.length),
    share(running, pairs),
    share(alone, filled.length),
    column.position === count - 1 ? 1 : 0,
    column.position === 0 ? 1 : 0,
    count === 1 ? 1 : 0,
    count === 2 ? 1 : 0,
    count >= 3 ? 1 : 0,
    count === 1 ? 0.5 : 1 - larger / (count - 1),
    filled.length === rows ? 1 : 0,
    negative > 0 && negative < filled.length ? 1 : 0,
  ].forEach((value, position) => {
    features[position] = value
  })
  const words = nameKey(column.header).split(' ').filter(Boolean)
  for (const word of words.length > 0 ? words : ['^$'])
    features[13 + bucketOf(/\d/.test(word) ? '0' : word)] = 1
  return features
}
