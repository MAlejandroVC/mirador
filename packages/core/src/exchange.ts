import { fractionDigits } from './money.ts'

// SYS-04, SYS-05: exchange rates the person enters (there is no rate service, Q12),
// with a dated history. A rate says how many units of `to` one unit of `from` buys,
// as an integer in millionths, so 18.45 is 18_450_000. Money never passes through a
// float: conversion multiplies integers with BigInt and rounds half away from zero.

/** Rates carry six decimals, enough for 1 MXN = 0.054235 USD. */
export const rateDecimals = 6
const rateScale = 10n ** BigInt(rateDecimals)

export interface ExchangeRateFields {
  /** One unit of this currency… */
  from: string
  /** …buys `rate` millionths of a unit of this one. */
  to: string
  rate: number
  /** The day the rate is for. */
  date: string
}

export interface ExchangeRate extends ExchangeRateFields {
  id: string
}

/** A rate in use: the rate to multiply by, and the entry it came from (SYS-05). */
export interface RateInUse<R extends ExchangeRate = ExchangeRate> {
  rate: R
  /** True when the entry is the other way round (to → from) and is divided by. */
  inverse: boolean
}

/**
 * SYS-05: the newest rate on or before `today` between the two currencies, in either
 * direction, or null when there is none. Rates dated later are planned, not in use.
 */
export function rateInUse<R extends ExchangeRate>(
  from: string,
  to: string,
  rates: readonly R[],
  today: string,
): RateInUse<R> | null {
  let best: RateInUse<R> | null = null
  for (const rate of rates) {
    if (rate.date > today || rate.rate <= 0) continue
    const direct = rate.from === from && rate.to === to
    const inverse = rate.from === to && rate.to === from
    if (!direct && !inverse) continue
    // The newest date wins; on the same date, the newest entry (UUIDv7 ids sort by time).
    if (
      !best ||
      rate.date > best.rate.date ||
      (rate.date === best.rate.date && rate.id > best.rate.id)
    )
      best = { rate, inverse }
  }
  return best
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n
  const n = numerator < 0n ? -numerator : numerator
  const d = denominator < 0n ? -denominator : denominator
  const rounded = (2n * n + d) / (2n * d)
  return negative ? -rounded : rounded
}

/** SYS-04: minor units of `from` in minor units of `to`, at the rate in use. */
export function convert(minor: number, from: string, to: string, inUse: RateInUse): number {
  const fromScale = 10n ** BigInt(fractionDigits(from))
  const toScale = 10n ** BigInt(fractionDigits(to))
  const rate = BigInt(inUse.rate.rate)
  const amount = BigInt(minor)
  const converted = inUse.inverse
    ? divideRounded(amount * toScale * rateScale, fromScale * rate)
    : divideRounded(amount * toScale * rate, fromScale * rateScale)
  return Number(converted)
}

/** SYS-05: a currency's rates against `to`, newest first, for its history. */
export function rateHistory<R extends ExchangeRate>(
  currency: string,
  to: string,
  rates: readonly R[],
): R[] {
  return rates
    .filter(
      (rate) =>
        (rate.from === currency && rate.to === to) || (rate.from === to && rate.to === currency),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
}

/** The rate as "1 `from` buys this many `to`", inverting an entry stored the other way. */
export function unitsPerOne(inUse: RateInUse): number {
  if (!inUse.inverse) return inUse.rate.rate
  return Number(divideRounded(rateScale * rateScale, BigInt(inUse.rate.rate)))
}

/**
 * TXN-05: the rate between what left one wallet and what arrived in another, in
 * millionths of a unit of `to` per unit of `from`, or null without both amounts.
 */
export function rateBetween(
  fromMinor: number,
  from: string,
  toMinor: number,
  to: string,
): number | null {
  if (fromMinor <= 0 || toMinor <= 0) return null
  const fromScale = 10n ** BigInt(fractionDigits(from))
  const toScale = 10n ** BigInt(fractionDigits(to))
  const rate = Number(
    divideRounded(BigInt(toMinor) * fromScale * rateScale, toScale * BigInt(fromMinor)),
  )
  return rate > 0 ? rate : null
}

/** TXN-05: minor units of `from` in minor units of `to` at a rate in millionths. */
export function applyRate(minor: number, from: string, to: string, rate: number): number {
  return convert(minor, from, to, {
    rate: { id: '', from, to, rate, date: '' },
    inverse: false,
  })
}
