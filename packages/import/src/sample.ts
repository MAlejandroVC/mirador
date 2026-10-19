import { addDays, addMonths, daysInMonth, fractionDigits } from '@repo/core'
import type { ImportRow } from './rows.ts'

// Sample data: about 14 months of made-up wallets and spending, so a new person (and
// whoever tests the app) can see every screen with something in it. It goes through the
// same import as a file, as one batch, so undoing it removes all of it (IMP-35). The
// names come from the starter set (CAT-04) in the person's language; nothing here is
// anyone's real data.

export interface SampleNames {
  wallet: (key: 'checking' | 'cash' | 'creditCard' | 'savings') => string
  group: (key: string) => string
  category: (key: string) => string
  tag: (key: string) => string
}

/** The wallets the sample makes and what each holds on the day it is added. */
export const sampleBalances = { checking: 24_850, cash: 1_320, creditCard: -6_480, savings: 52_000 }

// A small, fixed pseudo-random sequence, so the sample is the same every time.
function random(seed: number) {
  let state = seed
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
}

export function sampleRows(today: string, names: SampleNames, currency: string): ImportRow[] {
  const next = random(20_261_019)
  const scale = 10 ** fractionDigits(currency)
  const between = (low: number, high: number) =>
    Math.round((low + next() * (high - low)) * 100) / 100
  const rows: ImportRow[] = []
  const add = (
    date: string,
    wallet: keyof typeof sampleBalances,
    amount: number,
    group: string,
    category: string,
    payee = '',
    extra: Partial<ImportRow> = {},
  ) => {
    if (date > today) return
    rows.push({
      line: rows.length + 2,
      date,
      amount: Math.round(amount * scale),
      currency,
      transfer: false,
      payee,
      note: '',
      wallet: names.wallet(wallet),
      category: category === '' ? '' : names.category(category),
      group: group === '' ? '' : names.group(group),
      tags: [],
      problem: null,
      text: '',
      ...extra,
    })
  }
  const transfer = (
    date: string,
    from: keyof typeof sampleBalances,
    to: keyof typeof sampleBalances,
    amount: number,
  ) => {
    add(date, from, -amount, '', '', '', { transfer: true })
    add(date, to, amount, '', '', '', { transfer: true })
  }
  const day = (month: string, n: number) =>
    `${month.slice(0, 8)}${String(Math.min(n, daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7))))).padStart(2, '0')}`

  const start = addMonths(`${today.slice(0, 8)}01`, -13)
  for (let month = start; month <= today; month = addMonths(month, 1)) {
    const m = Number(month.slice(5, 7))
    // Income: a salary twice a month, sometimes freelance work.
    add(day(month, 1), 'checking', 18_500, 'income', 'salary', 'Empresa Norte')
    add(day(month, 15), 'checking', 18_500, 'income', 'salary', 'Empresa Norte')
    if (next() < 0.35) add(day(month, 20), 'checking', between(2_500, 6_000), 'income', 'freelance')
    if (m === 12) add(day(month, 18), 'checking', 15_000, 'income', 'bonus', 'Empresa Norte')
    // Home: rent and bills.
    add(day(month, 2), 'checking', -9_500, 'housing', 'rent')
    add(day(month, 8), 'creditCard', -599, 'housing', 'internet', 'Red Hogar')
    add(day(month, 12), 'creditCard', -399, 'housing', 'phone', 'Móvil Uno')
    if (m % 2 === 0) add(day(month, 10), 'checking', -between(420, 780), 'housing', 'electricity')
    if (m % 2 === 1) add(day(month, 14), 'checking', -between(180, 260), 'housing', 'water')
    // Food: groceries every week, coffee, eating out and delivery.
    for (let week = 0; week < 4; week += 1)
      add(
        day(month, 3 + week * 7),
        'creditCard',
        -between(850, 1_650),
        'food',
        'groceries',
        'Súper Norte',
      )
    for (let n = 0, count = 7 + Math.floor(next() * 6); n < count; n += 1)
      add(
        day(month, 1 + Math.floor(next() * 28)),
        'cash',
        -between(55, 95),
        'food',
        'coffee',
        'Café Luna',
      )
    for (let n = 0, count = 3 + Math.floor(next() * 4); n < count; n += 1)
      add(
        day(month, 1 + Math.floor(next() * 28)),
        'creditCard',
        -between(280, 950),
        'food',
        'restaurants',
        next() < 0.5 ? 'Taquería Don Luis' : 'Pizzería Roma',
      )
    for (let n = 0, count = 2 + Math.floor(next() * 5); n < count; n += 1)
      add(
        day(month, 1 + Math.floor(next() * 28)),
        'creditCard',
        -between(180, 460),
        'food',
        'delivery',
      )
    // Getting around.
    for (const n of [5, 15, 25])
      add(day(month, n), 'creditCard', -between(700, 1_050), 'transportation', 'fuel', 'Gas Sur')
    for (let n = 0, count = 2 + Math.floor(next() * 4); n < count; n += 1)
      add(
        day(month, 1 + Math.floor(next() * 28)),
        'cash',
        -between(80, 220),
        'transportation',
        'rides',
      )
    // Health, fun and shopping, less often.
    add(day(month, 6), 'creditCard', -650, 'health', 'gym', 'Gimnasio Vida')
    add(day(month, 9), 'creditCard', -219, 'entertainment', 'subscriptions')
    if (next() < 0.4)
      add(day(month, 17), 'creditCard', -between(150, 600), 'health', 'pharmacy', 'Farmacia Sol')
    if (next() < 0.5)
      add(
        day(month, 22),
        'creditCard',
        -between(180, 420),
        'entertainment',
        'movies',
        'Cine Centro',
      )
    if (next() < 0.45)
      add(day(month, 26), 'creditCard', -between(600, 2_400), 'shopping', 'clothes')
    if (m === 12) add(day(month, 20), 'creditCard', -between(3_500, 5_500), 'shopping', 'gifts')
    if (m === 7) {
      add(day(month, 8), 'creditCard', -between(7_500, 9_500), 'travel', 'flights', '', {
        tags: [names.tag('trip')],
      })
      add(day(month, 20), 'creditCard', -between(6_000, 8_000), 'travel', 'lodging', '', {
        tags: [names.tag('trip')],
      })
    }
    // Moving money: paying the card, saving, taking out cash.
    transfer(day(month, 16), 'checking', 'creditCard', between(9_000, 13_000))
    transfer(day(month, 16), 'checking', 'savings', 3_000)
    transfer(day(month, 4), 'checking', 'cash', 1_000)
  }
  // Once in a while, a refund.
  add(addDays(today, -40), 'creditCard', 450, 'income', 'refunds', 'Tienda Centro')
  return rows
}
