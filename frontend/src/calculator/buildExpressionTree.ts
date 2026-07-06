import type { ExpressionNode } from '../api/types'
import type { Operator, UnaryOperator } from './types'

export function buildExpressionTree(a: string, op: Operator, b: string): ExpressionNode {
  return { [op]: [a, b] }
}

export function buildUnaryExpressionTree(op: UnaryOperator, a: string): ExpressionNode {
  return { [op]: [a] }
}
