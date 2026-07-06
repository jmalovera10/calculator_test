import { describe, expect, it } from 'vitest'
import { formatDisplay } from './formatDisplay'
import { initialState } from './types'

describe('formatDisplay', () => {
  it('shows the plain current operand when no operator is pending', () => {
    expect(formatDisplay({ ...initialState, currentOperand: '12' })).toBe('12')
  })

  it('shows the live expression while an operand is being entered after an operator', () => {
    expect(
      formatDisplay({
        ...initialState,
        previousOperand: '12',
        operator: '+',
        currentOperand: '5',
      }),
    ).toBe('12 + 5')
  })

  it('shows the operator with a trailing space when no digits have been typed yet', () => {
    expect(
      formatDisplay({
        ...initialState,
        previousOperand: '12',
        operator: '+',
        currentOperand: '',
      }),
    ).toBe('12 +')
  })

  it('shows the result alone right after a successful evaluation', () => {
    expect(
      formatDisplay({
        ...initialState,
        result: '17',
        hasFreshResult: true,
      }),
    ).toBe('17')
  })

  it('shows the error message instead of the numeric display when an error is set', () => {
    expect(
      formatDisplay({
        ...initialState,
        currentOperand: '5',
        error: { code: 'DIVISION_BY_ZERO', message: 'division by zero' },
      }),
    ).toBe('division by zero')
  })
})
