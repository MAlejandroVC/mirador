import { describe, expect, it } from 'vitest'
import { convert, type ExchangeRate, rateHistory, rateInUse, unitsPerOne } from './exchange.ts'

const rate = (id: string, from: string, to: string, value: number, date: string): ExchangeRate => ({
  id,
  from,
  to,
  rate: value,
  date,
})

describe('exchange rates', () => {
  const rates = [
    rate('01', 'USD', 'MXN', 18_200_000, '2026-09-01'),
    rate('02', 'USD', 'MXN', 18_450_000, '2026-10-01'),
    rate('03', 'USD', 'MXN', 19_000_000, '2026-11-01'),
  ]

  it('SYS-05: uses the newest rate on or before today, not a later one', () => {
    expect(rateInUse('USD', 'MXN', rates, '2026-10-15')?.rate.id).toBe('02')
    expect(rateInUse('USD', 'MXN', rates, '2026-09-15')?.rate.id).toBe('01')
    expect(rateInUse('USD', 'MXN', rates, '2026-08-01')).toBeNull()
    expect(rateInUse('EUR', 'MXN', rates, '2026-10-15')).toBeNull()
  })

  it('SYS-04: converts minor units exactly, rounding to the nearest unit', () => {
    const inUse = rateInUse('USD', 'MXN', rates, '2026-10-15')
    if (!inUse) throw new Error('no rate')
    // 1,200.00 USD at 18.45 is 22,140.00 MXN.
    expect(convert(120_000, 'USD', 'MXN', inUse)).toBe(2_214_000)
    expect(convert(-120_000, 'USD', 'MXN', inUse)).toBe(-2_214_000)
    // 10.00 USD at 150.25 is 1,502.5 yen, rounded to 1,503 (yen have no cents).
    const yen = rate('04', 'USD', 'JPY', 150_250_000, '2026-10-01')
    expect(convert(1000, 'USD', 'JPY', { rate: yen, inverse: false })).toBe(1503)
  })

  it('SYS-04: a rate entered the other way round still converts, inverted', () => {
    // After the default currency changes from MXN to USD, a peso wallet uses USD→MXN.
    const inUse = rateInUse('MXN', 'USD', rates, '2026-10-15')
    if (!inUse) throw new Error('no rate')
    expect(inUse.inverse).toBe(true)
    expect(convert(2_214_000, 'MXN', 'USD', inUse)).toBe(120_000)
    expect(unitsPerOne(inUse)).toBe(54_201)
  })

  it('SYS-05: keeps a dated history, newest first', () => {
    expect(rateHistory('USD', 'MXN', rates).map((entry) => entry.id)).toEqual(['03', '02', '01'])
  })
})
