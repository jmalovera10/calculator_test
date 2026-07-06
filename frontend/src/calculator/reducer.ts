import type { Action, CalculatorState, Operator } from './types'
import { initialState } from './types'

function handleDigit(state: CalculatorState, digit: string): CalculatorState {
  if (state.error || state.hasFreshResult) {
    return { ...initialState, currentOperand: digit }
  }
  if (state.currentOperand === '' || state.currentOperand === '0') {
    return { ...state, currentOperand: digit }
  }
  return { ...state, currentOperand: state.currentOperand + digit }
}

function handleDecimalPoint(state: CalculatorState): CalculatorState {
  if (state.error || state.hasFreshResult) {
    return { ...initialState, currentOperand: '0.' }
  }
  if (state.currentOperand === '') {
    return { ...state, currentOperand: '0.' }
  }
  if (state.currentOperand.includes('.')) {
    return state
  }
  return { ...state, currentOperand: state.currentOperand + '.' }
}

function handleOperator(state: CalculatorState, operator: Operator): CalculatorState {
  if (state.error) {
    // Same "stale state is discarded" rule as handleDigit's error branch: an
    // error means currentOperand is leftover from the failed calculation, not
    // something the user intends to reuse, so start over from initialState.
    return handleOperator(initialState, operator)
  }
  if (state.hasFreshResult) {
    return { ...state, previousOperand: state.result, result: null, hasFreshResult: false, operator, currentOperand: '' }
  }
  if (state.operator !== null && state.currentOperand === '') {
    return { ...state, operator }
  }
  if (state.previousOperand === null) {
    return { ...state, previousOperand: state.currentOperand, operator, currentOperand: '' }
  }
  // A full (previousOperand, operator, currentOperand) pair is already pending here —
  // resolving it requires an async POST, which this pure reducer cannot perform.
  // useCalculator.ts intercepts this case before dispatching and instead evaluates
  // the pending pair, then re-dispatches OPERATOR once EVAL_SUCCESS lands
  // (hasFreshResult branch above). This fallback only matters if OPERATOR is
  // dispatched directly without going through that orchestration.
  return { ...state, previousOperand: state.currentOperand, operator, currentOperand: '' }
}

export function reducer(state: CalculatorState, action: Action): CalculatorState {
  switch (action.type) {
    case 'DIGIT':
      return handleDigit(state, action.digit)
    case 'DECIMAL_POINT':
      return handleDecimalPoint(state)
    case 'OPERATOR':
      return handleOperator(state, action.operator)
    case 'EQUALS':
      return state
    case 'CLEAR':
      return { ...initialState }
    case 'EVAL_START':
      return { ...state, isLoading: true, error: null }
    case 'EVAL_SUCCESS':
      return {
        ...state,
        isLoading: false,
        result: action.result,
        currentOperand: action.result,
        hasFreshResult: true,
        previousOperand: null,
        operator: null,
        error: null,
      }
    case 'EVAL_ERROR':
      return { ...state, isLoading: false, error: { code: action.code, message: action.message } }
    case 'UNARY_EVAL_SUCCESS': {
      // A unary op (√, %) only transforms currentOperand — unlike EVAL_SUCCESS,
      // it must not clear a pending (previousOperand, operator) chain, otherwise
      // e.g. "12 + 9 √" would lose the "12 +" context. hasFreshResult is only
      // set when there's no pending chain, so it behaves like a normal finished
      // result (replace-on-next-digit) in the standalone case.
      const isStandalone = state.previousOperand === null && state.operator === null
      return {
        ...state,
        currentOperand: action.result,
        result: isStandalone ? action.result : state.result,
        hasFreshResult: isStandalone,
        isLoading: false,
        error: null,
      }
    }
    default:
      return state
  }
}
