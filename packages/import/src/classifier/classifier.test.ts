import { describe, expect, it } from 'vitest'
import { labelColumn, labelWords, readMark } from './index.ts'
import { seeded, syntheticColumns, syntheticDescription } from './synthetic.ts'

describe('statement models', () => {
  it('IMP-08: labels the words of descriptions it never saw', () => {
    // A different seed from training: these statements are new to the model.
    const random = seeded(7)
    let right = 0
    let total = 0
    let marks = 0
    let marksFound = 0
    for (let row = 0; row < 2000; row += 1) {
      const description = syntheticDescription(random)
      const labels = labelWords(description.map((item) => item.word))
      for (const [index, item] of description.entries()) {
        total += 1
        if (labels[index] === item.label) right += 1
      }
      if (description.some((item) => item.label === 'installment')) {
        marks += 1
        const words = description.filter((_, index) => labels[index] === 'installment')
        if (readMark(words.map((item) => item.word))) marksFound += 1
      }
    }
    expect(right / total).toBeGreaterThan(0.97)
    expect(marksFound / marks).toBeGreaterThan(0.95)
  })

  it('IMP-04: tells what each amount column holds', () => {
    const random = seeded(11)
    let right = 0
    let total = 0
    for (let statement = 0; statement < 500; statement += 1)
      for (const { sample, label } of syntheticColumns(random)) {
        total += 1
        if (labelColumn(sample).label === label) right += 1
      }
    expect(right / total).toBeGreaterThan(0.95)
  })

  it('TXN-30: reads installment marks the ways statements write them', () => {
    const cases: [string, string[]][] = [
      ['LIVERPOOL INSURGENTES MSI 01/06', ['MSI', '01/06']],
      ['SHOPMART MX MSI 03/12', ['MSI', '03/12']],
      ['ALMACENES LUNA 3 DE 12 MSI', ['3', 'DE', '12', 'MSI']],
      ['CORNER MARKET INST 2 OF 6', ['INST', '2', 'OF', '6']],
    ]
    for (const [text, mark] of cases) {
      const words = text.split(' ')
      const labels = labelWords(words)
      expect(words.filter((_, index) => labels[index] === 'installment')).toEqual(mark)
    }
    expect(readMark(['MSI', '01/06'])).toEqual({ month: 1, months: 6 })
    expect(readMark(['3', 'DE', '12'])).toEqual({ month: 3, months: 12 })
    expect(readMark(['15/10'])).toBeNull()
  })

  it('IMP-08: keeps the payee and leaves out reference numbers', () => {
    const words = 'FARMACIA DEL CENTRO REF 4482910'.split(' ')
    expect(labelWords(words)).toEqual(['payee', 'payee', 'payee', 'reference', 'reference'])
    expect(labelWords(['PAGO', 'GRACIAS'])).toEqual(['payee', 'payee'])
  })
})
