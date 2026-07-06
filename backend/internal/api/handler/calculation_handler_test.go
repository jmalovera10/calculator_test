package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"calculator-backend/internal/api/dto"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func performRequest(body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/calculations", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")

	h := NewCalculationHandler()
	h.Create(c)
	return w
}

func TestCreate_HappyPath(t *testing.T) {
	w := performRequest(`{"expression": {"+": ["12", "5"]}}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", w.Code, w.Body.String())
	}
	var resp dto.CalculationResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if resp.Result != "17" {
		t.Fatalf("expected result 17, got %q", resp.Result)
	}
}

func TestCreate_NestedExpression(t *testing.T) {
	w := performRequest(`{"expression": {"/": [{"+": ["5", "1"]}, "3"]}}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", w.Code, w.Body.String())
	}
	var resp dto.CalculationResponse
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Result != "2" {
		t.Fatalf("expected result 2, got %q", resp.Result)
	}
}

func TestCreate_Errors(t *testing.T) {
	cases := []struct {
		name       string
		body       string
		wantStatus int
		wantCode   string
	}{
		{"malformed json", `{"expression": `, http.StatusBadRequest, "INVALID_JSON"},
		{"missing expression field", `{}`, http.StatusBadRequest, "INVALID_JSON"},
		{"unknown operator", `{"expression": {"^": ["2", "3"]}}`, http.StatusBadRequest, "UNKNOWN_OPERATOR"},
		{"wrong operand count", `{"expression": {"+": ["1"]}}`, http.StatusBadRequest, "INVALID_OPERAND_COUNT"},
		{"unparsable number", `{"expression": {"+": ["abc", "1"]}}`, http.StatusBadRequest, "INVALID_NUMBER"},
		{"division by zero", `{"expression": {"/": ["5", "0"]}}`, http.StatusBadRequest, "DIVISION_BY_ZERO"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := performRequest(tc.body)
			if w.Code != tc.wantStatus {
				t.Fatalf("expected status %d, got %d (%s)", tc.wantStatus, w.Code, w.Body.String())
			}
			var resp dto.ErrorResponse
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to unmarshal error response: %v (%s)", err, w.Body.String())
			}
			if resp.Error.Code != tc.wantCode {
				t.Fatalf("expected error code %q, got %q", tc.wantCode, resp.Error.Code)
			}
		})
	}
}
