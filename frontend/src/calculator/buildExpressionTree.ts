import type { ExpressionNode } from '../api/types'
import type { Operator } from './types'

export function buildExpressionTree(a: string, op: Operator, b: string): ExpressionNode {
  return { [op]: [a, b] }
}
