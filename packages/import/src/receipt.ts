import {
  defaultConfidence,
  isAmount,
  type Line,
  linesOf,
  readDateText,
  type TextPage,
  type TextWord,
} from './statement.ts'
import { guessDecimalMark, nameKey, readAmount, readDate } from './values.ts'

// IMP-07, WID-02: one transaction from a picture of a purchase ticket or a screenshot of
// a bank notification: the amount, the date and who was paid, each flagged when it was
// hard to read (IMP-10), so quick add opens filled in and the person only checks it.

export type ReceiptField = 'amount' | 'date' | 'payee'

export interface ReceiptReading {
  /** Minor units, positive: what was paid. */
  amount: number | null
  date: string | null
  payee: string
  unsure: ReceiptField[]
}

const totalWords = /\b(total|importe|a pagar|amount due|monto|total a pagar|grand total)\b/
const notTotal =
  /\b(subtotal|sub total|iva|tax|impuesto|propina|tip|cambio|change|efectivo|cash|ahorro|descuento|discount|articulos|items)\b/
// "Compra por $248.50 en OXXO", "You spent $12.40 at Blue Bottle".
const notification =
  /(?:compra|cargo|pago|retiro|purchase|payment|charge|spent|spend)\D{0,30}?([$€£]?\s?\d[\d.,]*)\s+(?:en|at|in)\s+([^\n.;]{2,40}?)(?:\s+(?:con|with|el|on|from|desde)\b|[.;\n]|$)/i
// Lines that name the ticket rather than the shop.
const notPayee =
  /^(ticket|factura|recibo|receipt|invoice|rfc|bienvenido|welcome|gracias|thank|fecha|date|hora|time|caja|cajero|cashier|folio|tel|www|http|suc|sucursal|store|tienda no)\b/

export function readReceipt(
  pages: readonly TextPage[],
  options: { currency: string; today: string; confidence?: number },
): ReceiptReading {
  const threshold = options.confidence ?? defaultConfidence
  const lines = pages.flatMap((page, index) => linesOf(page, index))
  const text = (line: Line) => line.words.map((word) => word.text).join(' ')
  const allAmounts = lines.flatMap((line) => line.words.filter((word) => isAmount(word.text)))
  const mark = guessDecimalMark(allAmounts.map((word) => word.text))
  const value = (word: TextWord) => {
    const minor = readAmount(word.text.replace(/\s?CR$/, ''), mark, options.currency)
    return minor === null ? null : Math.abs(minor)
  }
  const unsure: ReceiptField[] = []

  // A bank notification says it in one sentence.
  let amount: number | null = null
  let amountConfidence = 0
  let payee = ''
  let payeeConfidence = 0
  for (const line of lines) {
    const match = notification.exec(text(line))
    if (!match) continue
    const minor = readAmount(match[1] ?? '', mark, options.currency)
    if (minor === null) continue
    amount = Math.abs(minor)
    payee = (match[2] ?? '').trim()
    amountConfidence = payeeConfidence = Math.min(...line.words.map((word) => word.confidence))
    break
  }

  // A ticket: the largest amount on a line that says total, else the largest one.
  if (amount === null) {
    let best: TextWord | null = null
    for (const [index, line] of lines.entries()) {
      const key = nameKey(text(line))
      if (!totalWords.test(key) || notTotal.test(key)) continue
      const candidates = line.words.filter((word) => isAmount(word.text))
      // "TOTAL" alone on its line, the amount on the next.
      const next = lines[index + 1]
      if (candidates.length === 0 && next)
        candidates.push(...next.words.filter((word) => isAmount(word.text)))
      for (const word of candidates)
        if (!best || (value(word) ?? 0) > (value(best) ?? 0)) best = word
    }
    if (!best)
      for (const word of allAmounts)
        if (!best || (value(word) ?? 0) > (value(best) ?? 0)) best = word
    if (best) {
      amount = value(best)
      amountConfidence = best.confidence
    }
  }
  if (amount === null || amountConfidence < threshold) unsure.push('amount')

  // The first date anywhere; a notification without one happened today.
  const year = Number(options.today.slice(0, 4))
  let date: string | null = null
  let dateConfidence = 1
  search: for (const line of lines)
    for (let start = 0; start < line.words.length; start += 1)
      for (let used = Math.min(3, line.words.length - start); used >= 1; used -= 1) {
        const words = line.words.slice(start, start + used)
        const cell = readDateText(
          words
            .map((word) => word.text)
            .join(' ')
            .replace(/[,;]$/, ''),
          year,
        )
        const iso = cell && (/^\d{4}-/.test(cell) ? readDate(cell, 'ymd') : readDate(cell, 'dmy'))
        if (iso) {
          date = iso
          dateConfidence = Math.min(...words.map((word) => word.confidence))
          break search
        }
      }
  if (date && dateConfidence < threshold) unsure.push('date')

  // The shop: the first line near the top with a name in it.
  if (payee === '') {
    for (const line of lines.slice(0, 6)) {
      const words = line.words.filter((word) => !isAmount(word.text))
      const name = words
        .map((word) => word.text)
        .join(' ')
        .trim()
      if (!/[A-Za-zÁ-ú]{2}/.test(name)) continue
      if (name.length < 3 || notPayee.test(nameKey(name))) continue
      if (readDateText(name, year)) continue
      payee = name
      payeeConfidence = Math.min(...words.map((word) => word.confidence))
      break
    }
  }
  if (payee !== '' && payeeConfidence < threshold) unsure.push('payee')

  return { amount, date: date ?? options.today, payee: tidyName(payee), unsure }
}

/** "OXXO SUC 1234" stays as written but loses a trailing store number. */
function tidyName(name: string) {
  return name
    .replace(/\s+(suc(ursal)?|store|tienda)\.?\s*#?\s*\d+.*$/i, '')
    .replace(/\s+#?\d{3,}$/, '')
    .trim()
}
