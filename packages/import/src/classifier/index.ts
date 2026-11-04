import {
  type ColumnLabel,
  type ColumnSample,
  columnFeatures,
  type WordLabel,
  wordFeatures,
} from './features.ts'
import { predict } from './model.ts'
import { columnModel, wordModel } from './weights.ts'

export {
  type ColumnLabel,
  type ColumnSample,
  columnLabels,
  type WordLabel,
  wordLabels,
} from './features.ts'

/** IMP-08, TXN-30: what each word of a row's description is. */
export function labelWords(words: readonly string[]): WordLabel[] {
  return words.map((_, index) => predict(wordModel, wordFeatures(words, index)).label)
}

/** IMP-04: what an amount column holds, and how sure the model is. */
export function labelColumn(column: ColumnSample): { label: ColumnLabel; probability: number } {
  return predict(columnModel, columnFeatures(column))
}

/** An installment mark: this charge is month `month` of `months` (TXN-30). */
export interface InstallmentMark {
  month: number
  months: number
}

/**
 * The month and the number of months in the words the model called an installment
 * mark: "03/12", "3 DE 12", "2 OF 6". Null when they don't make one.
 */
export function readMark(words: readonly string[]): InstallmentMark | null {
  const text = words.join(' ')
  const found =
    /(\d{1,2})\s*\/\s*(\d{1,2})/.exec(text) ??
    /(\d{1,2})\s+(?:de|of|DE|OF|De|Of)\s+(\d{1,2})/.exec(text)
  if (!found) return null
  const month = Number(found[1])
  const months = Number(found[2])
  // TXN-30: a plan runs 2 to 60 months.
  if (months < 2 || months > 60 || month < 1 || month > months) return null
  return { month, months }
}
