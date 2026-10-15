// Money is an integer count of the currency's minor units plus its ISO 4217 code,
// never a float. Formatting and parsing go through the platform's number formatter
// (DL-NUM-05), working on decimal strings so no amount passes through a float.

export interface Money {
  minor: number
  currency: string
}

/** How many decimals the currency has: 2 for MXN and USD, 0 for JPY. */
export function fractionDigits(currency: string): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  )
}

/** The minor units as an exact decimal string, such as "-1234.50". */
export function toDecimalString(minor: number, currency: string): `${number}` {
  const digits = fractionDigits(currency)
  const sign = minor < 0 ? '-' : ''
  const units = Math.abs(minor)
    .toString()
    .padStart(digits + 1, '0')
  if (digits === 0) return `${sign}${units}` as `${number}`
  return `${sign}${units.slice(0, -digits)}.${units.slice(-digits)}` as `${number}`
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error(`Can't add ${a.currency} to ${b.currency}`)
  return { minor: a.minor + b.minor, currency: a.currency }
}

/**
 * How an amount is shown, in pieces, so the screen can set the whole units large and
 * the sign, symbol and cents smaller and muted (DL-NUM-01, DL-NUM-02).
 */
export interface MoneyParts {
  /** "−" (U+2212, DL-NUM-04), "+" or "". */
  sign: '' | '−' | '+'
  /** The currency symbol where it sits before the number, as in "$1,250.00". */
  prefix: string
  /** Grouped whole units, such as "1,250". */
  whole: string
  /** The decimal separator and the cents, such as ".00"; "" for a currency without them. */
  cents: string
  /** What follows the number: the symbol in locales that put it after, or the code. */
  suffix: string
}

export interface FormatOptions {
  locale: string
  /** DL-NUM-06: the main currency shows only its symbol, any other its code after. */
  mainCurrency: string
  /**
   * DL-NUM-03: `negative` (balances, net worth) marks only negative amounts with a
   * minus; `always` (a change, such as an adjustment) marks both directions.
   */
  signs?: 'negative' | 'always'
}

export function moneyParts(money: Money, options: FormatOptions): MoneyParts {
  const digits = fractionDigits(money.currency)
  const main = money.currency === options.mainCurrency
  const formatter = new Intl.NumberFormat(options.locale, {
    ...(main
      ? { style: 'currency', currency: money.currency, currencyDisplay: 'narrowSymbol' }
      : { style: 'decimal' }),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  const parts: MoneyParts = { sign: '', prefix: '', whole: '', cents: '', suffix: '' }
  let seenNumber = false
  for (const part of formatter.formatToParts(
    toDecimalString(Math.abs(money.minor), money.currency),
  )) {
    switch (part.type) {
      case 'integer':
      case 'group':
        seenNumber = true
        parts.whole += part.value
        break
      case 'decimal':
      case 'fraction':
        parts.cents += part.value
        break
      case 'currency':
      case 'literal':
        if (seenNumber) parts.suffix += part.value
        else parts.prefix += part.value
        break
      default:
        break
    }
  }
  if (!main) parts.suffix += ` ${money.currency}`
  if (money.minor < 0) parts.sign = '−'
  else if (money.minor > 0 && options.signs === 'always') parts.sign = '+'
  return parts
}

/** The amount as one string, such as "−$1,250.00" or "120.00 USD". */
export function formatMoney(money: Money, options: FormatOptions): string {
  const { sign, prefix, whole, cents, suffix } = moneyParts(money, options)
  return `${sign}${prefix}${whole}${cents}${suffix}`
}

function decimalSeparator(locale: string) {
  return (
    new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === 'decimal')
      ?.value ?? '.'
  )
}

/**
 * Reads what the person typed, such as "1,250.5", as minor units, or null when it is
 * not an amount. Only a magnitude: the screen asks for the direction separately.
 * Group separators are ignored; the locale's decimal separator splits the cents.
 */
export function parseAmount(text: string, currency: string, locale: string): number | null {
  const decimal = decimalSeparator(locale)
  const cleaned = text.replace(/[\s\u00a0\u202f$]/g, '')
  if (cleaned === '') return null
  const [whole = '', fraction = '', ...rest] = cleaned.split(decimal)
  if (rest.length > 0) return null
  const digitsOnly = whole.replace(decimal === '.' ? /,/g : /\./g, '')
  if (!/^\d*$/.test(digitsOnly) || !/^\d*$/.test(fraction)) return null
  if (digitsOnly === '' && fraction === '') return null
  const digits = fractionDigits(currency)
  if (fraction.length > digits) return null
  const minor = Number(`${digitsOnly || '0'}${fraction.padEnd(digits, '0')}`)
  return Number.isSafeInteger(minor) ? minor : null
}

/** The amount as the person would type it to edit it: "1250.50", no grouping. */
export function amountInput(minor: number, currency: string, locale: string): string {
  return toDecimalString(Math.abs(minor), currency).replace('.', decimalSeparator(locale))
}
