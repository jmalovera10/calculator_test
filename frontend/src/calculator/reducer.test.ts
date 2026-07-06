import { describe, expect, it } from 'vitest'
import { reducer } from './reducer'
import { initialState } from './types'
import type { CalculatorState } from './types'

describe('reducer', () => {
  it('appends digits to the current operand', () => {
    let state = reducer(initialState, { type: 'DIGIT', digit: '1' })
    state = reducer(state, { type: 'DIGIT', digit: '2' })
    expect(state.currentOperand).toBe('12')
  })

  it('replaces the leading zero instead of concatenating', () => {
    const state = reducer(initialState, { type: 'DIGIT', digit: '5' })
    expect(state.currentOperand).toBe('5')
  })

  it('guards against a second decimal point', () => {
    let state: CalculatorState = { ...initialState, currentOperand: '1.5' }
    state = reducer(state, { type: 'DECIMAL_POINT' })
    expect(state.currentOperand).toBe('1.5')
  })

  it('captures the current operand and operator on first operator press', () => {
    let state = reducer(initialState, { type: 'DIGIT', digit: '2' })
    state = reducer(state, { type: 'OPERATOR', operator: '+' })
    expect(state.previousOperand).toBe('2')
    expect(state.operator).toBe('+')
    expect(state.currentOperand).toBe('')
  })

  it('replaces the pending operator when a second operator is pressed before any digits', () => {
    let state: CalculatorState = { ...initialState, previousOperand: '12', operator: '+', currentOperand: '' }
    state = reducer(state, { type: 'OPERATOR', operator: '-' })
    expect(state.operator).toBe('-')
    expect(state.previousOperand).toBe('12')
  })

  it('resets everything on CLEAR', () => {
    const dirty: CalculatorState = {
      currentOperand: '99',
      previousOperand: '1',
      operator: '+',
      result: '5',
      hasFreshResult: true,
      error: { code: 'X', message: 'x' },
      isLoading: false,
    }
    expect(reducer(dirty, { type: 'CLEAR' })).toEqual(initialState)
  })

  it('sets isLoading and clears any prior error on EVAL_START', () => {
    const state = reducer({ ...initialState, error: { code: 'X', message: 'x' } }, { type: 'EVAL_START' })
    expect(state.isLoading).toBe(true)
    expect(state.error).toBeNull()
  })

  it('shows the result and marks hasFreshResult on EVAL_SUCCESS', () => {
    const state = reducer(
      { ...initialState, previousOperand: '12', operator: '+', currentOperand: '5', isLoading: true },
      { type: 'EVAL_SUCCESS', result: '17' },
    )
    expect(state.result).toBe('17')
    expect(state.hasFreshResult).toBe(true)
    expect(state.previousOperand).toBeNull()
    expect(state.operator).toBeNull()
    expect(state.isLoading).toBe(false)
  })

  it('sets the error and stops loading on EVAL_ERROR', () => {
    const state = reducer(
      { ...initialState, isLoading: true },
      { type: 'EVAL_ERROR', code: 'DIVISION_BY_ZERO', message: 'division by zero' },
    )
    expect(state.error).toEqual({ code: 'DIVISION_BY_ZERO', message: 'division by zero' })
    expect(state.isLoading).toBe(false)
  })

  describe('answer-replace behavior after a fresh result', () => {
    const afterResult: CalculatorState = {
      ...initialState,
      result: '17',
      currentOperand: '17',
      hasFreshResult: true,
    }

    it('pressing a digit replaces the answer and starts a brand-new entry', () => {
      const state = reducer(afterResult, { type: 'DIGIT', digit: '3' })
      expect(state).toEqual({ ...initialState, currentOperand: '3' })
    })

    it('pressing an operator instead chains from the shown result', () => {
      const state = reducer(afterResult, { type: 'OPERATOR', operator: '*' })
      expect(state.previousOperand).toBe('17')
      expect(state.operator).toBe('*')
      expect(state.currentOperand).toBe('')
      expect(state.hasFreshResult).toBe(false)
    })
  })

  describe('error-then-digit clears the error', () => {
    const withError: CalculatorState = {
      ...initialState,
      currentOperand: '5',
      previousOperand: '5',
      operator: '/',
      error: { code: 'DIVISION_BY_ZERO', message: 'division by zero' },
    }

    it('pressing a digit clears the error and starts fresh', () => {
      const state = reducer(withError, { type: 'DIGIT', digit: '9' })
      expect(state).toEqual({ ...initialState, currentOperand: '9' })
    })

    it('pressing an operator also clears the error and starts a fresh chain from 0, not the stale operand', () => {
      const state = reducer(withError, { type: 'OPERATOR', operator: '+' })
      expect(state).toEqual({ ...initialState, previousOperand: '0', operator: '+', currentOperand: '' })
    })
  })

  describe('mid-chain operator resolution (composed via the async orchestrator)', () => {
    it('once the pending pair is evaluated (EVAL_SUCCESS), a follow-up OPERATOR chains from that result', () => {
      // Simulates useCalculator.ts's flow for "5 + 3 + 2": pressing the second "+"
      // while (previousOperand: "5", operator: "+", currentOperand: "3") is pending
      // triggers an evaluation of (5, "+", 3); once it resolves, EVAL_SUCCESS then a
      // follow-up OPERATOR("+") is dispatched, landing in the hasFreshResult branch.
      let state: CalculatorState = { ...initialState, previousOperand: '5', operator: '+', currentOperand: '3' }
      state = reducer(state, { type: 'EVAL_SUCCESS', result: '8' })
      state = reducer(state, { type: 'OPERATOR', operator: '+' })

      expect(state.previousOperand).toBe('8')
      expect(state.operator).toBe('+')
      expect(state.currentOperand).toBe('')
      expect(state.hasFreshResult).toBe(false)
    })
  })
})
