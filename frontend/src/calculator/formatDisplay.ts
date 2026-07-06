import type { CalculatorState } from './types'

export function formatDisplay(state: CalculatorState): string {
  if (state.error) {
    return state.error.message
  }
  if (state.hasFreshResult) {
    return state.result ?? '0'
  }
  if (state.operator) {
    return `${state.previousOperand ?? ''} ${state.operator} ${state.currentOperand}`.trimEnd()
  }
  return state.currentOperand
}
