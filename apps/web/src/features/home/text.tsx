import type { Recurring } from '@repo/core'
import type { TFunction } from 'i18next'
import { Fragment, type ReactNode } from 'react'
import type { Taxonomy } from '../categories/lookups'

// How Home puts its items into words.

/** A recurring transaction's name, as its row says it (DL-CMP-07). */
export function recurringName(recurring: Recurring, lookups: Taxonomy, t: TFunction) {
  const payee = recurring.payeeId === undefined ? undefined : lookups.payees.get(recurring.payeeId)
  const note = recurring.note?.trim()
  return (
    payee?.name ??
    (note === undefined || note === '' ? undefined : note) ??
    lookups.categoryOf(recurring)?.name ??
    t(`transactions.types.${recurring.kind}`)
  )
}

/**
 * A translated sentence with parts set apart, such as an amount in Moss: each
 * `{{name}}` is passed as a marker and the sentence split around it, so every language
 * keeps its own word order.
 */
export function sentence(
  translate: (values: Record<string, string>) => string,
  parts: Record<string, ReactNode>,
): ReactNode {
  const marker = (name: string) => `\u0000${name}\u0000`
  const text = translate(Object.fromEntries(Object.keys(parts).map((name) => [name, marker(name)])))
  return text.split('\u0000').map((piece, index) =>
    // Odd pieces are the names between markers.
    index % 2 === 1 ? <Fragment key={index}>{parts[piece]}</Fragment> : piece,
  )
}
