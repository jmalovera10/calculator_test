export type ExpressionNode = string | Record<string, ExpressionNode[]>

export interface CalculationResponse {
  result: string
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}

export class ApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}
