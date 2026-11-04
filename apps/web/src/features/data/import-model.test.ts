import { headerKey, readStatement, type TextPage, type TextWord } from '@repo/import'
import { describe, expect, it } from 'vitest'
import type { Ledger } from '../wallets/use-ledger'
import { startingSettings } from './import-model'

// A made-up card statement: each line is [left, text] pairs, words 7 px a character.
function page(lines: (readonly [number, string])[][]): TextPage {
  const words: TextWord[] = []
  lines.forEach((line, row) => {
    for (const [x, text] of line)
      words.push({ text, x, y: 40 + row * 20, width: text.length * 7, height: 12, confidence: 1 })
  })
  return { width: 600, height: 800, words }
}
const right = (end: number, text: string) => [end - text.length * 7, text] as const

const table = readStatement(
  [
    page([
      [[20, 'Fecha'], [90, 'Descripción'], right(420, 'Importe')],
      [[20, '02/OCT'], [90, 'CAFE AZUL'], right(420, '96.00')],
      [[20, '05/OCT'], [90, 'TIENDA AURORA MSI 03/12'], right(420, '1,250.00')],
      [[20, '09/OCT'], [90, 'SUPERMERCADO LA HUERTA'], right(420, '1,842.30')],
    ]),
  ],
  { year: 2026 },
)
const file = { name: 'card.pdf', fingerprint: 'f', table }
const walletId = '01a15ccf-8951-71ba-9e73-48bde2a5a777'

// startingSettings only looks at the saved layouts.
const ledgerWith = (profiles: Ledger['profiles']) => ({ profiles }) as unknown as Ledger

describe('statement layouts', () => {
  it('IMP-14: a statement with a corrected layout is read the same way next time', () => {
    const saved = {
      id: '01a15ccf-8951-71ba-9e73-48bde2a5a778',
      headerKey: headerKey(table.header),
      columns: ['date', 'note', 'amount'] as const,
      dateOrder: 'ymd' as const,
      decimalMark: '.' as const,
      amountSign: 'negativeIsExpense' as const,
      walletId,
      installments: false,
    }
    const start = startingSettings(file, ledgerWith([{ ...saved, columns: [...saved.columns] }]))
    expect(start.profileId).toBe(saved.id)
    expect(start.walletId).toBe(walletId)
    expect(start.settings).toMatchObject({
      columns: ['date', 'note', 'amount'],
      amountSign: 'negativeIsExpense',
      installments: false,
    })
  })

  it('IMP-14: once the layout is forgotten, the statement is read afresh', () => {
    const start = startingSettings(file, ledgerWith([]))
    expect(start.profileId).toBeNull()
    expect(start.settings.columns).toEqual(['date', 'payee', 'amount'])
    expect(start.settings.amountSign).toBe('positiveIsExpense')
  })
})
