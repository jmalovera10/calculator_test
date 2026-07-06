package expression

import (
	"encoding/json"
	"testing"
)

func TestNode_UnmarshalJSON_Literal(t *testing.T) {
	var n Node
	if err := json.Unmarshal([]byte(`"12"`), &n); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !n.IsLiteral || n.Literal != "12" {
		t.Fatalf("expected literal 12, got %+v", n)
	}
}

func TestNode_UnmarshalJSON_SingleKeyOperator(t *testing.T) {
	var n Node
	if err := json.Unmarshal([]byte(`{"+": ["1", "2"]}`), &n); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n.IsLiteral {
		t.Fatalf("expected operator node, got literal")
	}
	if n.Operator != "+" {
		t.Fatalf("expected operator '+', got %q", n.Operator)
	}
	if len(n.Operands) != 2 || n.Operands[0].Literal != "1" || n.Operands[1].Literal != "2" {
		t.Fatalf("unexpected operands: %+v", n.Operands)
	}
}

func TestNode_UnmarshalJSON_NestedOperand(t *testing.T) {
	var n Node
	if err := json.Unmarshal([]byte(`{"+": [{"-": ["1", "2"]}, "3"]}`), &n); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n.Operator != "+" || len(n.Operands) != 2 {
		t.Fatalf("unexpected root node: %+v", n)
	}
	nested := n.Operands[0]
	if nested.IsLiteral || nested.Operator != "-" {
		t.Fatalf("expected nested '-' operator node, got %+v", nested)
	}
	if nested.Operands[0].Literal != "1" || nested.Operands[1].Literal != "2" {
		t.Fatalf("unexpected nested operands: %+v", nested.Operands)
	}
	if n.Operands[1].Literal != "3" {
		t.Fatalf("expected second operand literal '3', got %+v", n.Operands[1])
	}
}

func TestNode_UnmarshalJSON_MultiKeyObjectErrors(t *testing.T) {
	var n Node
	err := json.Unmarshal([]byte(`{"+": ["1", "2"], "-": ["3", "4"]}`), &n)
	if err == nil {
		t.Fatal("expected error for multi-key operator object, got nil")
	}
	if _, ok := err.(*SyntaxError); !ok {
		t.Fatalf("expected *SyntaxError, got %T", err)
	}
}

func TestNode_UnmarshalJSON_EmptyObjectErrors(t *testing.T) {
	var n Node
	err := json.Unmarshal([]byte(`{}`), &n)
	if err == nil {
		t.Fatal("expected error for empty operator object, got nil")
	}
}

func TestNode_UnmarshalJSON_InvalidShapeErrors(t *testing.T) {
	var n Node
	err := json.Unmarshal([]byte(`42`), &n)
	if err == nil {
		t.Fatal("expected error for a bare JSON number, got nil")
	}
}

func TestNode_UnmarshalJSON_OperandsNotArrayErrors(t *testing.T) {
	var n Node
	err := json.Unmarshal([]byte(`{"+": "not-an-array"}`), &n)
	if err == nil {
		t.Fatal("expected error when operands is not an array, got nil")
	}
}
