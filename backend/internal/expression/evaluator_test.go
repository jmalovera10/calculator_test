package expression

import (
	"math"
	"testing"
)

func lit(s string) Node { return Node{IsLiteral: true, Literal: s} }
func op(operator string, operands ...Node) Node {
	return Node{Operator: operator, Operands: operands}
}

func TestEvaluate_HappyPath(t *testing.T) {
	cases := []struct {
		name string
		node Node
		want float64
	}{
		{"addition", op("+", lit("12"), lit("5")), 17},
		{"subtraction", op("-", lit("10"), lit("4")), 6},
		{"multiplication", op("*", lit("6"), lit("7")), 42},
		{"division", op("/", lit("20"), lit("4")), 5},
		{"decimal literals", op("+", lit("1.5"), lit("2.5")), 4},
		{"negative result", op("-", lit("3"), lit("10")), -7},
		{"nested: (5+1)/3", op("/", op("+", lit("5"), lit("1")), lit("3")), 2},
		{"deeply nested", op("+", op("-", lit("1"), lit("2")), lit("3")), 2},
		{"exponentiation", op("^", lit("2"), lit("10")), 1024},
		{"square root", op("sqrt", lit("9")), 3},
		{"percentage", op("%", lit("50")), 0.5},
		{"nested: 1 + sqrt(16)", op("+", lit("1"), op("sqrt", lit("16"))), 5},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Evaluate(tc.node)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestEvaluate_Errors(t *testing.T) {
	cases := []struct {
		name     string
		node     Node
		wantCode string
	}{
		{"unknown operator", op("@", lit("2"), lit("3")), "UNKNOWN_OPERATOR"},
		{"too few operands", op("+", lit("1")), "INVALID_OPERAND_COUNT"},
		{"too many operands", op("+", lit("1"), lit("2"), lit("3")), "INVALID_OPERAND_COUNT"},
		{"zero operands", op("+"), "INVALID_OPERAND_COUNT"},
		{"unparsable literal", op("+", lit("abc"), lit("1")), "INVALID_NUMBER"},
		{"division by zero", op("/", lit("5"), lit("0")), "DIVISION_BY_ZERO"},
		{"nested error propagates", op("+", op("/", lit("1"), lit("0")), lit("2")), "DIVISION_BY_ZERO"},
		{"nested unknown operator propagates", op("+", lit("1"), op("@", lit("2"), lit("3"))), "UNKNOWN_OPERATOR"},
		{"negative square root", op("sqrt", lit("-4")), "NEGATIVE_SQRT"},
		{"sqrt zero operands", op("sqrt"), "INVALID_OPERAND_COUNT"},
		{"sqrt too many operands", op("sqrt", lit("1"), lit("2")), "INVALID_OPERAND_COUNT"},
		{"percentage zero operands", op("%"), "INVALID_OPERAND_COUNT"},
		{"percentage too many operands", op("%", lit("1"), lit("2")), "INVALID_OPERAND_COUNT"},
		{"exponentiation too few operands", op("^", lit("2")), "INVALID_OPERAND_COUNT"},
		{"exponentiation too many operands", op("^", lit("2"), lit("3"), lit("4")), "INVALID_OPERAND_COUNT"},
		{"bare Infinity literal is rejected as out of range", lit("Infinity"), "RESULT_OUT_OF_RANGE"},
		{"bare NaN literal is rejected as out of range", lit("NaN"), "RESULT_OUT_OF_RANGE"},
		{"literal overflowing float64 is out of range, not invalid", lit("1e400"), "RESULT_OUT_OF_RANGE"},
		{"nested Infinity literal is rejected as out of range", op("+", lit("Infinity"), lit("1")), "RESULT_OUT_OF_RANGE"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Evaluate(tc.node)
			if err == nil {
				t.Fatal("expected an error, got nil")
			}
			evalErr, ok := err.(*EvalError)
			if !ok {
				t.Fatalf("expected *EvalError, got %T (%v)", err, err)
			}
			if evalErr.Code != tc.wantCode {
				t.Fatalf("got code %q, want %q", evalErr.Code, tc.wantCode)
			}
		})
	}
}

func TestEvaluate_Overflow(t *testing.T) {
	huge := lit("1.7976931348623157e+308") // math.MaxFloat64
	_, err := Evaluate(op("*", huge, huge))
	if err == nil {
		t.Fatal("expected overflow error, got nil")
	}
	evalErr, ok := err.(*EvalError)
	if !ok || evalErr.Code != "RESULT_OUT_OF_RANGE" {
		t.Fatalf("expected RESULT_OUT_OF_RANGE, got %v", err)
	}
}

func TestFormatResult(t *testing.T) {
	cases := []struct {
		v    float64
		want string
	}{
		{17, "17"},
		{-7, "-7"},
		{4.5, "4.5"},
		{0, "0"},
		{math.Copysign(0, -1), "0"}, // negative zero must not render as "-0"
	}
	for _, tc := range cases {
		if got := FormatResult(tc.v); got != tc.want {
			t.Fatalf("FormatResult(%v) = %q, want %q", tc.v, got, tc.want)
		}
	}
}

func TestEvaluate_NegativeZeroResultIsNormalized(t *testing.T) {
	// 0 * -5 produces IEEE-754 negative zero; the API must not surface "-0".
	got, err := Evaluate(op("*", lit("0"), lit("-5")))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if FormatResult(got) != "0" {
		t.Fatalf("FormatResult(%v) = %q, want %q", got, FormatResult(got), "0")
	}
}
