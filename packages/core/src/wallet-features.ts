import { addMonths, daysBetween, nextDayOfMonth, type Period, previousDayOfMonth } from './dates.ts'

// WAL-13 to WAL-18: what each optional feature works out. Rates are integers in
// hundredths of a percent (basis points), so 10.5% is 1050. Interest needs powers and
// so floats, but only for the growth factor: every amount is rounded to whole minor
// units before it is shown or saved.

/** Hundredths of a percent: 1050 is 10.50% a year. */
export const percentDecimals = 2

export type RateType = 'nominal' | 'effective'
export type Compounding = 'daily' | 'monthly' | 'yearly'

/** WAL-13: an annual rate, how it is quoted, and how often it compounds. */
export interface InterestSettings {
  /** Basis points a year. */
  rate: number
  /**
   * `nominal`: the plain annual rate, divided by how often it compounds (what Mexican
   * credit cards and loans quote as "tasa anual"). `effective`: what a year actually
   * yields, compounding included (GAT on Mexican savings accounts).
   */
  type: RateType
  compounding: Compounding
}

const periodsPerYear: Record<Compounding, number> = { daily: 365, monthly: 12, yearly: 1 }

/** How much a balance grows over `days`: 0.01 is 1%. */
export function growthOver(interest: InterestSettings, days: number): number {
  const annual = interest.rate / 10_000
  if (interest.type === 'effective') return (1 + annual) ** (days / 365) - 1
  const n = periodsPerYear[interest.compounding]
  return (1 + annual / n) ** ((n * days) / 365) - 1
}

/** The rate per month, which loan payments use. */
export function monthlyRate(interest: InterestSettings): number {
  const annual = interest.rate / 10_000
  if (interest.type === 'effective') return (1 + annual) ** (1 / 12) - 1
  if (interest.compounding === 'monthly') return annual / 12
  return growthOver(interest, 365 / 12)
}

/**
 * WAL-13: the interest this period, at today's balance: positive is earned, negative is
 * charged (a negative balance grows more negative).
 */
export function interestForPeriod(
  balance: number,
  interest: InterestSettings,
  period: Period,
): number {
  const days = daysBetween(period.start, period.end) + 1
  return Math.round(balance * growthOver(interest, days))
}

/** WAL-15: a fee the wallet charges, such as an annual fee or a monthly account fee. */
export interface Fee {
  id: string
  name: string
  /** Minor units, positive; it is taken from the balance. */
  amount: number
  every: 'month' | 'year'
  /** A reminder for the person, such as "Waived if I use the card every month". */
  note?: string
  /** The first time it is charged; later ones fall on the same day of the month. */
  start: string
  /** The last date confirmed or skipped, so it is offered only once. */
  handled?: string
}

/** The fee's dates from its start, every month or year, on its start's day of month. */
function feeDate(fee: Fee, index: number): string {
  return addMonths(fee.start, fee.every === 'month' ? index : index * 12)
}

/** The fee's first date after `after` (any date after its start counts as "after" none). */
function firstFeeDateAfter(fee: Fee, after: string | undefined): { date: string; index: number } {
  if (!after || after < fee.start) return { date: fee.start, index: 0 }
  const step = fee.every === 'month' ? 1 : 12
  const [startYear = 0, startMonth = 0] = fee.start.split('-').map(Number)
  const [year = 0, month = 0] = after.split('-').map(Number)
  let index = Math.max(0, Math.floor(((year - startYear) * 12 + (month - startMonth)) / step))
  while (feeDate(fee, index) <= after) index += 1
  return { date: feeDate(fee, index), index }
}

export interface DueFee {
  fee: Fee
  date: string
}

/**
 * WAL-15: the expected fee transactions to confirm: every date up to `today` not yet
 * confirmed or skipped, oldest first. At most `limit` per fee, so a fee set up with an
 * old start asks about a year, not a decade.
 */
export function dueFees(fees: readonly Fee[], today: string, limit = 12): DueFee[] {
  const due: DueFee[] = []
  for (const fee of fees) {
    const dates: string[] = []
    let { index } = firstFeeDateAfter(fee, fee.handled)
    for (let date = feeDate(fee, index); date <= today; date = feeDate(fee, ++index))
      dates.push(date)
    for (const date of dates.slice(-limit)) due.push({ fee, date })
  }
  return due.sort((a, b) => a.date.localeCompare(b.date) || a.fee.name.localeCompare(b.fee.name))
}

/** WAL-15: when the fee is next charged, after `today` and anything already handled. */
export function nextFeeDate(fee: Fee, today: string): string {
  const after = fee.handled && fee.handled > today ? fee.handled : today
  return firstFeeDateAfter(fee, after < fee.start ? undefined : after).date
}

/** WAL-15: the fee once a date is confirmed or skipped. Later dates stay to come. */
export function handleFee(fee: Fee, date: string): Fee {
  return { ...fee, handled: fee.handled && fee.handled > date ? fee.handled : date }
}

/** WAL-16: a credit card's limit and its statement and payment days. */
export interface CreditSettings {
  /** Minor units, positive. */
  limit: number
  /** The day of the month the statement closes. */
  closingDay: number
  /** The day of the month the payment is due. */
  dueDay: number
}

export interface CreditSummary {
  /** What is owed now, minor units, positive. */
  used: number
  /** What can still be spent; negative when over the limit. */
  available: number
  /** Used over limit, from 0 (over 1 when over the limit). */
  utilization: number
  nextClosing: string
  /** The payment due next: for the statement that closed last, until that date passes. */
  nextDue: string
}

/** WAL-16: utilization and the next statement and payment dates. */
export function creditSummary(
  balance: number,
  credit: CreditSettings,
  today: string,
): CreditSummary {
  const used = Math.max(0, -balance)
  const lastClosing = previousDayOfMonth(today, credit.closingDay)
  const dueAfter = (closing: string) => nextDayOfMonth(addDay(closing), credit.dueDay)
  const lastDue = dueAfter(lastClosing)
  const nextClosing = nextDayOfMonth(today, credit.closingDay)
  return {
    used,
    available: credit.limit - used,
    utilization: credit.limit > 0 ? used / credit.limit : 0,
    nextClosing,
    nextDue: lastDue >= today ? lastDue : dueAfter(nextClosing),
  }
}

function addDay(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return next.toISOString().slice(0, 10)
}

/** WAL-17: what the loan contract says. The rate is the wallet's interest (WAL-13). */
export interface LoanSettings {
  /** What was borrowed, minor units. */
  principal: number
  termMonths: number
  /** The monthly payment, minor units. */
  payment: number
  /** The day of the month it is paid. */
  paymentDay: number
}

/** WAL-17: the monthly payment that pays `principal` off in `termMonths` at `interest`. */
export function loanPayment(
  principal: number,
  termMonths: number,
  interest: InterestSettings | undefined,
): number {
  if (termMonths <= 0) return 0
  const rate = interest ? monthlyRate(interest) : 0
  if (rate === 0) return Math.ceil(principal / termMonths)
  return Math.round((principal * rate) / (1 - (1 + rate) ** -termMonths))
}

export type LoanProjection =
  | { kind: 'paidOff' }
  /** The payment doesn't cover the interest, so the loan would never be paid off. */
  | { kind: 'never'; monthlyInterest: number }
  | {
      kind: 'onTrack'
      paymentsLeft: number
      payoffDate: string
      /** Interest still to pay, minor units. */
      interestLeft: number
      /** Interest over the whole contract, as signed: payments × term − principal. */
      contractInterest: number
    }

/**
 * WAL-17: from today's balance (negative: owed) and the payment, when the loan is paid
 * off and how much interest is still to pay. It steps through month by month, rounding
 * each month's interest to minor units as a lender would.
 */
export function loanProjection(
  balance: number,
  loan: LoanSettings,
  interest: InterestSettings | undefined,
  today: string,
): LoanProjection {
  let owed = Math.max(0, -balance)
  if (owed === 0) return { kind: 'paidOff' }
  const rate = interest ? monthlyRate(interest) : 0
  const firstInterest = Math.round(owed * rate)
  if (loan.payment <= firstInterest) return { kind: 'never', monthlyInterest: firstInterest }
  let payments = 0
  let interestLeft = 0
  while (owed > 0 && payments < 1200) {
    const charged = Math.round(owed * rate)
    interestLeft += charged
    owed = owed + charged - loan.payment
    payments += 1
  }
  const firstPayment = nextDayOfMonth(today, loan.paymentDay)
  return {
    kind: 'onTrack',
    paymentsLeft: payments,
    payoffDate: addMonths(firstPayment, payments - 1, loan.paymentDay),
    interestLeft,
    contractInterest: Math.max(0, loan.payment * loan.termMonths - loan.principal),
  }
}

export interface ValuationSummary {
  /** What went in: every transaction except market-value updates. */
  contributed: number
  /** WAL-18: what the market added (negative: took away). */
  gain: number
  /** The gain over what went in, or null when nothing went in. */
  gainShare: number | null
}

/** WAL-18: contributions versus gains, from the wallet's transactions. */
export function valuationSummary(
  transactions: readonly { kind: string; amount: number }[],
): ValuationSummary {
  let contributed = 0
  let gain = 0
  for (const transaction of transactions) {
    if (transaction.kind === 'valuation') gain += transaction.amount
    else contributed += transaction.amount
  }
  return { contributed, gain, gainShare: contributed > 0 ? gain / contributed : null }
}
