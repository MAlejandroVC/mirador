// Currencies the person can pick (SYS-01, WAL-02), named by the platform in the app's
// language, so no list of names needs translating by hand.

/** Shown first in a currency picker: Mexico first, then the Americas and Europe (SYS-10). */
export const commonCurrencies = ['MXN', 'USD', 'EUR', 'CAD', 'COP', 'ARS', 'CLP', 'PEN', 'GBP']

export function allCurrencies(): string[] {
  return Intl.supportedValuesOf('currency')
}

export function currencyName(code: string, locale: string): string {
  const name = new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
}

// The currency of each region where Mirador's languages are spoken, plus the few
// others people commonly set their device to. Anything else starts with USD.
const regionCurrency: Record<string, string> = {
  MX: 'MXN',
  US: 'USD',
  CA: 'CAD',
  GB: 'GBP',
  ES: 'EUR',
  AR: 'ARS',
  BO: 'BOB',
  CL: 'CLP',
  CO: 'COP',
  CR: 'CRC',
  CU: 'CUP',
  DO: 'DOP',
  EC: 'USD',
  GT: 'GTQ',
  HN: 'HNL',
  NI: 'NIO',
  PA: 'PAB',
  PE: 'PEN',
  PR: 'USD',
  PY: 'PYG',
  SV: 'USD',
  UY: 'UYU',
  VE: 'VES',
  AU: 'AUD',
  NZ: 'NZD',
  IN: 'INR',
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  PT: 'EUR',
  NL: 'EUR',
  IE: 'EUR',
  BR: 'BRL',
}

/**
 * SYS-01, DL-PRI-04: a sensible default currency before the person picks one, from
 * the region of the device's language (es-MX gives MXN). Plain "es" counts as Mexico,
 * the app's first market.
 */
export function guessCurrency(locale: string): string {
  let region: string | undefined
  try {
    region = new Intl.Locale(locale).maximize().region
  } catch {
    region = undefined
  }
  if (!locale.includes('-') && locale.startsWith('es')) region = 'MX'
  return (region && regionCurrency[region]) ?? 'USD'
}
