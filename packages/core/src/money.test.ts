import { describe, expect, it } from 'vitest'
import { guessCurrency } from './currencies.ts'
import { amountInput, formatMoney, fractionDigits, moneyParts, parseAmount } from './money.ts'

const mxn = { locale: 'es-MX', mainCurrency: 'MXN' }

describe('money', () => {
  it('DL-NUM-03: a negative balance shows the true minus, a positive one no sign', () => {
    expect(formatMoney({ minor: -325000, currency: 'MXN' }, mxn)).toBe('−$3,250.00')
    expect(formatMoney({ minor: 325000, currency: 'MXN' }, mxn)).toBe('$3,250.00')
    expect(formatMoney({ minor: 0, currency: 'MXN' }, mxn)).toBe('$0.00')
  })

  it('DL-NUM-03: a change shows its direction both ways', () => {
    expect(formatMoney({ minor: 1250, currency: 'MXN' }, { ...mxn, signs: 'always' })).toBe(
      '+$12.50',
    )
    expect(formatMoney({ minor: -1250, currency: 'MXN' }, { ...mxn, signs: 'always' })).toBe(
      '−$12.50',
    )
  })

  it('DL-NUM-06: another currency shows its code after the number', () => {
    expect(formatMoney({ minor: 12000, currency: 'USD' }, mxn)).toBe('120.00 USD')
    expect(formatMoney({ minor: 1200, currency: 'JPY' }, mxn)).toBe('1,200 JPY')
  })

  it('DL-NUM-01: splits the whole units from the sign, symbol and cents', () => {
    expect(moneyParts({ minor: -2418050, currency: 'MXN' }, mxn)).toEqual({
      sign: '−',
      prefix: '$',
      whole: '24,180',
      cents: '.50',
      suffix: '',
    })
    expect(
      moneyParts({ minor: 123450, currency: 'EUR' }, { locale: 'es-ES', mainCurrency: 'EUR' }),
    ).toEqual({ sign: '', prefix: '', whole: '1234', cents: ',50', suffix: '\u00a0€' })
  })

  it('keeps large amounts exact, without floats', () => {
    expect(formatMoney({ minor: 900719925474099, currency: 'MXN' }, mxn)).toBe(
      '$9,007,199,254,740.99',
    )
  })

  it('reads typed amounts as minor units', () => {
    expect(parseAmount('1,250.5', 'MXN', 'es-MX')).toBe(125050)
    expect(parseAmount('$ 3250', 'MXN', 'en-US')).toBe(325000)
    expect(parseAmount('.5', 'USD', 'en-US')).toBe(50)
    expect(parseAmount('1.234,56', 'EUR', 'es-ES')).toBe(123456)
    expect(parseAmount('1200', 'JPY', 'en-US')).toBe(1200)
  })

  it('refuses what is not an amount', () => {
    for (const text of ['', 'abc', '1.2.3', '12.345', '-5', '1.5'])
      expect(parseAmount(text, text === '1.5' ? 'JPY' : 'MXN', 'en-US'), text).toBeNull()
  })

  it('writes an amount back the way it is typed', () => {
    expect(amountInput(-125050, 'MXN', 'es-MX')).toBe('1250.50')
    expect(amountInput(123456, 'EUR', 'es-ES')).toBe('1234,56')
    expect(fractionDigits('JPY')).toBe(0)
  })

  it('SYS-01: guesses the default currency from the device language', () => {
    expect(guessCurrency('es-MX')).toBe('MXN')
    expect(guessCurrency('es')).toBe('MXN')
    expect(guessCurrency('en-US')).toBe('USD')
    expect(guessCurrency('es-ES')).toBe('EUR')
    expect(guessCurrency('es-CO')).toBe('COP')
    expect(guessCurrency('xx')).toBe('USD')
  })
})
