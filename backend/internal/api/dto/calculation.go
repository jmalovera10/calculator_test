package dto

import "calculator-backend/internal/expression"

// CalculationRequest is the wire shape of POST /api/v1/calculations.
// Expression is a pointer so a missing/null field can be distinguished from
// a present-but-zero-value node.
type CalculationRequest struct {
	Expression *expression.Node `json:"expression"`
}

// CalculationResponse is the wire shape of a successful calculation.
type CalculationResponse struct {
	Result string `json:"result"`
}

// ErrorBody is the inner payload of an error response.
type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ErrorResponse is the wire shape of any non-2xx response.
type ErrorResponse struct {
	Error ErrorBody `json:"error"`
}
