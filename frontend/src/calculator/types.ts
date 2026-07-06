export type Operator = '+' | '-' | '*' | '/' | '^'

export type UnaryOperator = 'sqrt' | '%'

export interface CalculatorState {
  currentOperand: string
  previousOperand: string | null
  operator: Operator | null
  result: string | null
  hasFreshResult: boolean
  error: { code: string; message: string } | null
  isLoading: boolean
}

export const initialState: CalculatorState = {
  currentOperand: '0',
  previousOperand: null,
  operator: null,
  result: null,
  hasFreshResult: false,
  error: null,
  isLoading: false,
}

export type Action =
  | { type: 'DIGIT'; digit: string }
  | { type: 'DECIMAL_POINT' }
  | { type: 'OPERATOR'; operator: Operator }
  | { type: 'EQUALS' }
  | { type: 'CLEAR' }
  | { type: 'EVAL_START' }
  | { type: 'EVAL_SUCCESS'; result: string }
  | { type: 'EVAL_ERROR'; code: string; message: string }
  | { type: 'UNARY_EVAL_SUCCESS'; result: string }
