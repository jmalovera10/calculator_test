package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"calculator-backend/internal/api"
	"calculator-backend/internal/api/dto"
)

// These tests build the real, fully-wired router and drive it with a real
// net/http.Client over a real socket (httptest.NewServer), proving that
// routing + middleware + binding + evaluation are correctly wired together —
// distinct from the handler-level unit tests, which call the handler
// function directly.

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	router := api.NewRouter()
	srv := httptest.NewServer(router)
	t.Cleanup(srv.Close)
	return srv
}

func postCalculation(t *testing.T, srv *httptest.Server, body string) (*http.Response, []byte) {
	t.Helper()
	resp, err := http.Post(srv.URL+"/api/v1/calculations", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	buf := make([]byte, 0, 1024)
	tmp := make([]byte, 1024)
	for {
		n, err := resp.Body.Read(tmp)
		buf = append(buf, tmp[:n]...)
		if err != nil {
			break
		}
	}
	return resp, buf
}

func TestIntegration_HealthCheck(t *testing.T) {
	srv := newTestServer(t)
	resp, err := http.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// Readiness tooling (wait-on, curl -I, container orchestrators) commonly
// probes with HEAD rather than GET — this caught a real bug where the
// containerized e2e run hung forever because Gin doesn't implicitly answer
// HEAD for a route only registered via GET.
func TestIntegration_HealthCheck_HEAD(t *testing.T) {
	srv := newTestServer(t)
	resp, err := http.Head(srv.URL + "/healthz")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_HappyPath(t *testing.T) {
	srv := newTestServer(t)

	cases := []struct {
		name string
		body string
		want string
	}{
		{"addition", `{"expression": {"+": ["12", "5"]}}`, "17"},
		{"subtraction", `{"expression": {"-": ["10", "4"]}}`, "6"},
		{"multiplication", `{"expression": {"*": ["6", "7"]}}`, "42"},
		{"division", `{"expression": {"/": ["20", "4"]}}`, "5"},
		{"nested expression", `{"expression": {"/": [{"+": ["5", "1"]}, "3"]}}`, "2"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp, body := postCalculation(t, srv, tc.body)
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("expected 200, got %d (%s)", resp.StatusCode, body)
			}
			var out dto.CalculationResponse
			if err := json.Unmarshal(body, &out); err != nil {
				t.Fatalf("failed to unmarshal response: %v (%s)", err, body)
			}
			if out.Result != tc.want {
				t.Fatalf("got result %q, want %q", out.Result, tc.want)
			}
		})
	}
}

func TestIntegration_ErrorCases(t *testing.T) {
	srv := newTestServer(t)

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
		{"multi-key operator object", `{"expression": {"+": ["1","2"], "-": ["3","4"]}}`, http.StatusBadRequest, "INVALID_JSON"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp, body := postCalculation(t, srv, tc.body)
			if resp.StatusCode != tc.wantStatus {
				t.Fatalf("expected status %d, got %d (%s)", tc.wantStatus, resp.StatusCode, body)
			}
			var out dto.ErrorResponse
			if err := json.Unmarshal(body, &out); err != nil {
				t.Fatalf("failed to unmarshal error response: %v (%s)", err, body)
			}
			if out.Error.Code != tc.wantCode {
				t.Fatalf("expected error code %q, got %q (message: %s)", tc.wantCode, out.Error.Code, out.Error.Message)
			}
		})
	}
}
