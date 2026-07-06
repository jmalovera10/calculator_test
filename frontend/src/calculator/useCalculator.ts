import { useCallback, useReducer } from 'react'
import { evaluate } from '../api/client'
import { ApiError } from '../api/types'
import { buildExpressionTree, buildUnaryExpressionTree } from './buildExpressionTree'
import { reducer } from './reducer'
import type { Operator, UnaryOperator } from './types'
import { initialState } from './types'

export function useCalculator() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const runEvaluation = useCallback(
    async (a: string, op: Operator, b: string, thenOperator?: Operator) => {
      dispatch({ type: 'EVAL_START' })
      try {
        const result = await evaluate(buildExpressionTree(a, op, b))
        dispatch({ type: 'EVAL_SUCCESS', result })
        if (thenOperator) {
          dispatch({ type: 'OPERATOR', operator: thenOperator })
        }
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : new ApiError('INTERNAL_ERROR', 'unexpected error')
        dispatch({ type: 'EVAL_ERROR', code: apiErr.code, message: apiErr.message })
      }
    },
    [],
  )

  const runUnaryEvaluation = useCallback(async (operator: UnaryOperator, operand: string) => {
    dispatch({ type: 'EVAL_START' })
    try {
      const result = await evaluate(buildUnaryExpressionTree(operator, operand))
      dispatch({ type: 'UNARY_EVAL_SUCCESS', result })
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError('INTERNAL_ERROR', 'unexpected error')
      dispatch({ type: 'EVAL_ERROR', code: apiErr.code, message: apiErr.message })
    }
  }, [])

  const pressDigit = useCallback((digit: string) => dispatch({ type: 'DIGIT', digit }), [])
  const pressDecimalPoint = useCallback(() => dispatch({ type: 'DECIMAL_POINT' }), [])
  const pressClear = useCallback(() => dispatch({ type: 'CLEAR' }), [])

  const pressOperator = useCallback(
    (operator: Operator) => {
      const midChainPending =
        !state.hasFreshResult &&
        !state.error &&
        state.previousOperand !== null &&
        state.operator !== null &&
        state.currentOperand !== ''

      if (midChainPending) {
        void runEvaluation(state.previousOperand as string, state.operator as Operator, state.currentOperand, operator)
        return
      }
      dispatch({ type: 'OPERATOR', operator })
    },
    [state, runEvaluation],
  )

  const pressEquals = useCallback(() => {
    if (state.error || state.previousOperand === null || state.operator === null || state.currentOperand === '') {
      return
    }
    void runEvaluation(state.previousOperand, state.operator, state.currentOperand)
  }, [state, runEvaluation])

  const pressUnaryOperator = useCallback(
    (operator: UnaryOperator) => {
      if (state.isLoading) return
      const operand = state.currentOperand === '' ? '0' : state.currentOperand
      void runUnaryEvaluation(operator, operand)
    },
    [state, runUnaryEvaluation],
  )

  return { state, pressDigit, pressDecimalPoint, pressOperator, pressEquals, pressClear, pressUnaryOperator }
}
