import { ApiError } from './types'
import type { ApiErrorBody, CalculationResponse, ExpressionNode } from './types'

export async function evaluate(expression: ExpressionNode): Promise<string> {
  const res = await fetch('/api/v1/calculations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expression }),
  })
  const body = (await res.json()) as CalculationResponse | ApiErrorBody

  if (!res.ok) {
    const { error } = body as ApiErrorBody
    throw new ApiError(error.code, error.message)
  }

  return (body as CalculationResponse).result
}
