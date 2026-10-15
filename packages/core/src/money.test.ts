import { describe, expect, it } from 'vitest'
import { guessCurrency } from './currencies.ts'
import {
  amountInput,
  amountText,
  formatMoney,
  fractionDigits,
  moneyParts,
  parseAmount,
  typedAmount,
} from './money.ts'

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

  it('DL-CMP-09: an amount is grouped as it is typed, with the decimals to come faint', () => {
    expect(typedAmount('1234567', 'en-US', 2)).toEqual({ text: '1,234,567', rest: '.00' })
    expect(typedAmount('1,2345.5', 'en-US', 2)).toEqual({ text: '12,345.5', rest: '0' })
    expect(typedAmount('12.345', 'en-US', 2)).toEqual({ text: '12.34', rest: '' })
    expect(typedAmount('.5', 'en-US', 2)).toEqual({ text: '0.5', rest: '0' })
    expect(typedAmount('007', 'en-US', 2)).toEqual({ text: '7', rest: '.00' })
    expect(typedAmount('', 'en-US', 2)).toEqual({ text: '', rest: '' })
    expect(typedAmount('$ 1.2.3', 'en-US', 2)).toEqual({ text: '1.23', rest: '' })
    // Yen have no decimals; Mexico writes like the US.
    expect(typedAmount('1500.5', 'ja-JP', 0)).toEqual({ text: '15,005', rest: '' })
    expect(typedAmount('25000', 'es-MX', 2)).toEqual({ text: '25,000', rest: '.00' })
    // An exchange rate keeps up to six decimals and fills in two.
    expect(typedAmount('18.4521', 'en-US', 6, 2)).toEqual({ text: '18.4521', rest: '' })
    // What is shown still reads back as the same amount.
    expect(parseAmount(typedAmount('1234567.8', 'en-US', 2).text, 'USD', 'en-US')).toBe(123456780)
    expect(amountText(123456780, 'USD', 'en-US')).toBe('1,234,567.80')
  })
})
