package expression

import (
	"errors"
	"fmt"
	"math"
	"strconv"
)

// EvalError is a stable, machine-readable evaluation error. Its Code is
// suitable for direct mapping to an API error response.
type EvalError struct {
	Code    string
	Message string
}

func (e *EvalError) Error() string {
	return e.Message
}

// EvalFunc computes the result of an operator given its already-evaluated
// operands.
type EvalFunc func(operands []float64) (float64, error)

// Operator describes a single supported operator: its arity bounds and how
// to evaluate it.
type Operator struct {
	Symbol   string
	MinArity int
	MaxArity int
	Eval     EvalFunc
}

// registry is the operator dispatch table. Adding a new operator is a single
// entry here — no other code path needs to change.
var registry = map[string]Operator{
	"+": {
		Symbol: "+", MinArity: 2, MaxArity: 2,
		Eval: func(o []float64) (float64, error) { return o[0] + o[1], nil },
	},
	"-": {
		Symbol: "-", MinArity: 2, MaxArity: 2,
		Eval: func(o []float64) (float64, error) { return o[0] - o[1], nil },
	},
	"*": {
		Symbol: "*", MinArity: 2, MaxArity: 2,
		Eval: func(o []float64) (float64, error) { return o[0] * o[1], nil },
	},
	"/": {
		Symbol: "/", MinArity: 2, MaxArity: 2,
		Eval: func(o []float64) (float64, error) {
			if o[1] == 0 {
				return 0, &EvalError{Code: "DIVISION_BY_ZERO", Message: "division by zero"}
			}
			return o[0] / o[1], nil
		},
	},
	"^": {
		Symbol: "^", MinArity: 2, MaxArity: 2,
		Eval: func(o []float64) (float64, error) { return math.Pow(o[0], o[1]), nil },
	},
	"sqrt": {
		Symbol: "sqrt", MinArity: 1, MaxArity: 1,
		Eval: func(o []float64) (float64, error) {
			if o[0] < 0 {
				return 0, &EvalError{Code: "NEGATIVE_SQRT", Message: "cannot take the square root of a negative number"}
			}
			return math.Sqrt(o[0]), nil
		},
	},
	"%": {
		Symbol: "%", MinArity: 1, MaxArity: 1,
		Eval: func(o []float64) (float64, error) { return o[0] / 100, nil },
	},
}

// Evaluate recursively evaluates an expression tree, returning the numeric
// result or an *EvalError describing what went wrong.
func Evaluate(n Node) (float64, error) {
	if n.IsLiteral {
		v, err := strconv.ParseFloat(n.Literal, 64)
		if err != nil {
			var numErr *strconv.NumError
			if errors.As(err, &numErr) && errors.Is(numErr.Err, strconv.ErrRange) {
				return 0, &EvalError{Code: "RESULT_OUT_OF_RANGE", Message: "result is not a finite number"}
			}
			return 0, &EvalError{Code: "INVALID_NUMBER", Message: fmt.Sprintf("%q is not a valid number", n.Literal)}
		}
		if math.IsInf(v, 0) || math.IsNaN(v) {
			return 0, &EvalError{Code: "RESULT_OUT_OF_RANGE", Message: "result is not a finite number"}
		}
		return v, nil
	}

	op, ok := registry[n.Operator]
	if !ok {
		return 0, &EvalError{Code: "UNKNOWN_OPERATOR", Message: fmt.Sprintf("unknown operator %q", n.Operator)}
	}
	if len(n.Operands) < op.MinArity || len(n.Operands) > op.MaxArity {
		return 0, &EvalError{Code: "INVALID_OPERAND_COUNT", Message: fmt.Sprintf("%q requires %d operands, got %d", n.Operator, op.MinArity, len(n.Operands))}
	}

	values := make([]float64, len(n.Operands))
	for i, operand := range n.Operands {
		v, err := Evaluate(operand)
		if err != nil {
			return 0, err
		}
		values[i] = v
	}

	result, err := op.Eval(values)
	if err != nil {
		return 0, err
	}
	if math.IsInf(result, 0) || math.IsNaN(result) {
		return 0, &EvalError{Code: "RESULT_OUT_OF_RANGE", Message: "result is not a finite number"}
	}
	return result, nil
}

// FormatResult renders a float64 result as the shortest round-trippable
// decimal string, matching the string-typed number contract used for
// operands.
func FormatResult(v float64) string {
	if v == 0 {
		v = 0 // normalize negative zero (-0) to positive zero
	}
	return strconv.FormatFloat(v, 'f', -1, 64)
}
