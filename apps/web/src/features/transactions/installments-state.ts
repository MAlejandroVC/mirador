import { amountText, type InstallmentPlan } from '@repo/core'

// The plans Mexican banks offer most ("3, 6, 9, 12, 18 y 24 meses"); Other takes any
// number from 2 to 60.
export const usualMonths = [3, 6, 9, 12, 18, 24] as const

/** TXN-30: an installment plan as the form holds it, typed text included. */
export interface InstallmentState {
  on: boolean
  months: number
  other: boolean
  monthsText: string
  interest: boolean
  paymentText: string
  deferred: number
  paidOff?: string
}

/** How a saved plan opens in the form, or how a new one starts: off, 6 months. */
export function initialInstallments(
  plan: InstallmentPlan | undefined,
  total: number,
  currency: string,
  locale: string,
): InstallmentState {
  if (!plan)
    return {
      on: false,
      months: 6,
      other: false,
      monthsText: '',
      interest: false,
      paymentText: '',
      deferred: 0,
    }
  const usual = (usualMonths as readonly number[]).includes(plan.months)
  return {
    on: true,
    months: plan.months,
    other: !usual,
    monthsText: usual ? '' : String(plan.months),
    interest: plan.price !== undefined,
    paymentText:
      plan.price === undefined ? '' : amountText(Math.round(total / plan.months), currency, locale),
    deferred: plan.deferred ?? 0,
    ...(plan.paidOff !== undefined ? { paidOff: plan.paidOff } : {}),
  }
}

/** The number of months chosen, or null while Other holds no number from 2 to 60. */
export function chosenMonths(state: InstallmentState): number | null {
  if (!state.other) return state.months
  const months = Number.parseInt(state.monthsText, 10)
  return Number.isInteger(months) && months >= 2 && months <= 60 ? months : null
}
