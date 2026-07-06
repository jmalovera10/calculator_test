package expression

import (
	"encoding/json"
	"fmt"
)

// Node is a single node of the LISP-prefix expression tree. It is either a
// literal number (encoded as a JSON string) or an operator object with
// exactly one key, whose value is the array of operand nodes.
type Node struct {
	IsLiteral bool
	Literal   string
	Operator  string
	Operands  []Node
}

// SyntaxError represents a structurally malformed expression tree (wrong
// JSON shape), as opposed to an evaluation-time error.
type SyntaxError struct {
	Message string
}

func (e *SyntaxError) Error() string {
	return e.Message
}

// UnmarshalJSON implements a custom decoder for the recursive, discriminated
// Node shape: a plain JSON string is a literal; a JSON object must have
// exactly one key naming the operator, mapping to an array of operands.
func (n *Node) UnmarshalJSON(data []byte) error {
	var lit string
	if err := json.Unmarshal(data, &lit); err == nil {
		n.IsLiteral = true
		n.Literal = lit
		n.Operator = ""
		n.Operands = nil
		return nil
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return &SyntaxError{Message: "expression node must be a string or a single-key operator object"}
	}
	if len(raw) != 1 {
		return &SyntaxError{Message: fmt.Sprintf("operator object must have exactly one key, got %d", len(raw))}
	}

	for op, operandsRaw := range raw {
		var operands []Node
		if err := json.Unmarshal(operandsRaw, &operands); err != nil {
			return &SyntaxError{Message: fmt.Sprintf("operands for %q must be an array", op)}
		}
		n.IsLiteral = false
		n.Operator = op
		n.Operands = operands
	}
	return nil
}
