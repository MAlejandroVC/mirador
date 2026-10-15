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

export function decimalSeparator(locale: string) {
  return (
    new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === 'decimal')
      ?.value ?? '.'
  )
}

/**
 * Reads a decimal number the person typed, such as "1,250.5", as an integer scaled by
 * 10^`decimals` (12505000 for decimals 4), or null when it is not one, has more decimals,
 * or is negative. Group separators are ignored; the locale's decimal separator splits
 * the fraction. Spaces and a "$" or "%" around it are ignored too.
 */
export function parseDecimal(text: string, locale: string, decimals: number): number | null {
  const decimal = decimalSeparator(locale)
  const cleaned = text.replace(/[\s\u00a0\u202f$%]/g, '')
  if (cleaned === '') return null
  const [whole = '', fraction = '', ...rest] = cleaned.split(decimal)
  if (rest.length > 0) return null
  const digitsOnly = whole.replace(decimal === '.' ? /,/g : /\./g, '')
  if (!/^\d*$/.test(digitsOnly) || !/^\d*$/.test(fraction)) return null
  if (digitsOnly === '' && fraction === '') return null
  if (fraction.length > decimals) return null
  const scaled = Number(`${digitsOnly || '0'}${fraction.padEnd(decimals, '0')}`)
  return Number.isSafeInteger(scaled) ? scaled : null
}

/**
 * Reads what the person typed, such as "1,250.5", as minor units, or null when it is
 * not an amount. Only a magnitude: the screen asks for the direction separately.
 */
export function parseAmount(text: string, currency: string, locale: string): number | null {
  return parseDecimal(text, locale, fractionDigits(currency))
}

/** A scaled integer (see parseDecimal) as the person would type it: "18.45", no grouping. */
export function decimalInput(scaled: number, decimals: number, locale: string): string {
  const units = Math.abs(scaled)
    .toString()
    .padStart(decimals + 1, '0')
  if (decimals === 0) return units
  const fraction = units.slice(-decimals).replace(/0+$/, '')
  return fraction === ''
    ? units.slice(0, -decimals)
    : `${units.slice(0, -decimals)}${decimalSeparator(locale)}${fraction}`
}

/** A scaled integer formatted for reading, such as "18.45" or "18,45", with grouping. */
export function formatDecimal(
  scaled: number,
  decimals: number,
  locale: string,
  minimum = 0,
): string {
  const units = Math.abs(scaled)
    .toString()
    .padStart(decimals + 1, '0')
  const exact = (
    decimals === 0 ? units : `${units.slice(0, -decimals)}.${units.slice(-decimals)}`
  ) as `${number}`
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: minimum,
    maximumFractionDigits: decimals,
  }).format(exact)
}

/** The amount as the person would type it to edit it: "1250.50", no grouping. */
export function amountInput(minor: number, currency: string, locale: string): string {
  return toDecimalString(Math.abs(minor), currency).replace('.', decimalSeparator(locale))
}

/** What an amount field shows while the person types: their text, and the faint rest. */
export interface TypedAmount {
  /** The digits typed, grouped every three as the locale writes them: "1,250.5". */
  text: string
  /** The decimals still to come, shown faint after the text: "0" here, ".00" for "1,250". */
  rest: string
}

/**
 * Tidies what the person typed in an amount field, as they type: only digits and one
 * decimal separator, at most `decimals` decimals, grouped as the locale writes numbers.
 * `shown` is how many decimals the faint rest fills in, so "12" reads as "12.00".
 */
export function typedAmount(
  typed: string,
  locale: string,
  decimals: number,
  shown = decimals,
): TypedAmount {
  const decimal = decimalSeparator(locale)
  let whole = ''
  let fraction: string | null = null
  for (const char of typed) {
    if (char >= '0' && char <= '9') {
      if (fraction === null) whole += char
      else if (fraction.length < decimals) fraction += char
    } else if (char === decimal && fraction === null && decimals > 0) fraction = ''
  }
  // Leading zeros go, and so do digits past what an amount can hold exactly.
  whole = whole.replace(/^0+(?=\d)/, '').slice(0, 13)
  if (whole === '' && fraction === null) return { text: '', rest: '' }
  const grouped = new Intl.NumberFormat(locale, { useGrouping: true }).format(BigInt(whole || '0'))
  const text = fraction === null ? grouped : `${grouped}${decimal}${fraction}`
  const rest =
    fraction === null
      ? shown > 0
        ? `${decimal}${'0'.repeat(shown)}`
        : ''
      : '0'.repeat(Math.max(0, shown - fraction.length))
  return { text, rest }
}

/** An amount ready to edit, as typedAmount shows it: "1,250.50". */
export function amountText(minor: number, currency: string, locale: string): string {
  return typedAmount(amountInput(minor, currency, locale), locale, fractionDigits(currency)).text
}
