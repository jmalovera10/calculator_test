# Implementation Plan — Full-Stack Calculator

## Context

This implements the objective in `docs/objective.spec.md`: a full-stack calculator with a React (TypeScript) frontend and a Go (Gin) backend REST API, supporting the four basic operations (+, -, *, /).

Repo is currently empty aside from docs/README/LICENSE — this is a from-scratch build.

Confirmed design decisions (fixed, not up for debate):

1. Separate top-level folders: `backend/` and `frontend/`.
2. The expression model is a LISP-prefix-style JSON tree, open to future extension (composition/grouping, e.g. `(5+1)/3`): an operator key maps to an operand array, and operands can themselves be nested operator objects.
3. Numbers in the JSON expression tree are represented as **strings**, parsed and computed by the Go backend (via `strconv.ParseFloat`).
4. Only the 4 basic operations are in scope for this build (+, -, *, /) — but the evaluator must be a registry/dispatch table, not a hardcoded if/else, so adding operators later is a one-line change.
5. A "Clear" action resets the current value to zero.
6. State (last result reuse) lives **client-side only**. The backend is a fully stateless pure-function evaluator exposed via a RESTful resource endpoint. The frontend substitutes the last result into the next expression tree before POSTing.
7. Syntax validation: no missing operands, correct operand count, unknown operators rejected. Backend validates independently of frontend. Consistent JSON error envelope with HTTP status codes.
8. RESTful conventions: "calculation" as the resource noun, versioned path (`/api/v1/...`).
9. Docker: include Dockerfiles for backend + frontend, plus `docker-compose.yml` to run both together.
10. **Styling: Tailwind CSS** for the frontend (utility classes, no hand-rolled CSS files).
11. **Full expression display**: the display shows the whole in-progress expression (e.g. `5 + 5`) as it's composed, not just the current operand, until `=` is pressed and a result replaces it.
12. **Answer-replace behavior**: once a result is shown, pressing a *digit* replaces it and starts a brand-new entry from scratch. Pressing an *operator* instead continues the chain, reusing the shown result as the first operand (unchanged from the "reuse last result" requirement).
13. **Integration tests required** (in addition to unit tests) that exercise the real HTTP path end-to-end — backend: real router + real HTTP request/response cycle; full stack: a browser-driven end-to-end suite covering both the happy path and error cases.
14. **The Playwright e2e suite must be containerized**: runnable with a single Docker command and no local Node/Go/Playwright/browser installation — it targets the already-running `backend`/`frontend` containers over the Compose network rather than spawning local dev servers.

---

## Top-level layout

```
/
├── backend/                 # Go + Gin service
├── frontend/                # React + TS SPA (Tailwind)
├── e2e/                     # cross-service Playwright end-to-end tests
├── playwright.config.ts
├── package.json              # thin root package, just to run Playwright
├── docker-compose.yml
├── README.md                # rewritten with full docs
└── docs/                     # existing spec docs, untouched
```

---

## 1. Backend (Go + Gin)

### 1.1 Directory layout

```
backend/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── expression/
│   │   ├── node.go              # recursive expression-tree type + custom UnmarshalJSON
│   │   ├── node_test.go
│   │   ├── evaluator.go         # operator registry + recursive Evaluate()
│   │   └── evaluator_test.go
│   └── api/
│       ├── router.go            # route registration (exported so tests can build the real router)
│       ├── router_integration_test.go  # spins up the REAL router via httptest.Server, hits it over real HTTP
│       ├── dto/
│       │   └── calculation.go   # request/response/error wire types
│       ├── handler/
│       │   ├── calculation_handler.go
│       │   └── calculation_handler_test.go
│       └── middleware/
│           ├── cors.go
│           └── error.go         # shared JSON-error writer
├── go.mod
├── go.sum
├── Dockerfile
├── .dockerignore
└── Makefile                     # test / cover / run / build targets
```

### 1.2 Expression tree — the recursive, discriminated-union type

An operand is either a JSON string (a number literal) or a JSON object with **exactly one key** (the operator) mapping to an array of further operands. Modeled as a single struct with a custom `UnmarshalJSON`, since Go has no native discriminated unions:

```go
// internal/expression/node.go
package expression

type Node struct {
	IsLiteral bool
	Literal   string // valid when IsLiteral
	Operator  string // valid when !IsLiteral
	Operands  []Node // valid when !IsLiteral
}

func (n *Node) UnmarshalJSON(data []byte) error {
	// 1. Try "leaf" shape: a JSON string, e.g. "12"
	var lit string
	if err := json.Unmarshal(data, &lit); err == nil {
		n.IsLiteral, n.Literal = true, lit
		return nil
	}

	// 2. Otherwise it must be an object with exactly one key: {"+": [...]}
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
		n.Operator, n.Operands = op, operands
	}
	return nil
}
```

Because `Node.UnmarshalJSON` is invoked recursively by `encoding/json` for every element of `Operands []Node`, arbitrarily nested trees like `{"+": [{"-": ["1","2"]}, "3"]}` unmarshal correctly with zero extra code.

Request DTO: `CalculationRequest struct { Expression expression.Node \`json:"expression"\` }`.

### 1.3 Evaluator — registry/dispatch, not if/else

```go
// internal/expression/evaluator.go
type EvalFunc func(operands []float64) (float64, error)

type Operator struct {
	Symbol   string
	MinArity int
	MaxArity int // MVP: MinArity == MaxArity == 2 for all four ops (strictly binary)
	Eval     EvalFunc
}

var registry = map[string]Operator{
	"+": {"+", 2, 2, func(o []float64) (float64, error) { return o[0] + o[1], nil }},
	"-": {"-", 2, 2, func(o []float64) (float64, error) { return o[0] - o[1], nil }},
	"*": {"*", 2, 2, func(o []float64) (float64, error) { return o[0] * o[1], nil }},
	"/": {"/", 2, 2, func(o []float64) (float64, error) {
		if o[1] == 0 {
			return 0, &EvalError{Code: "DIVISION_BY_ZERO", Message: "division by zero"}
		}
		return o[0] / o[1], nil
	}},
}

func Evaluate(n Node) (float64, error) {
	if n.IsLiteral {
		v, err := strconv.ParseFloat(n.Literal, 64)
		if err != nil {
			return 0, &EvalError{Code: "INVALID_NUMBER", Message: fmt.Sprintf("%q is not a valid number", n.Literal)}
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
		v, err := Evaluate(operand) // recursive descent, errors propagate up untouched
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
```

`EvalError` implements `error` and carries a stable `Code` string, letting the handler map it straight to the JSON error envelope without re-deriving meaning from error text. **Adding a 5th operator later (e.g. `^`) is a one-line registry entry — no code path changes.**

### 1.4 Error envelope & status mapping

```json
{ "error": { "code": "DIVISION_BY_ZERO", "message": "division by zero" } }
```

| Code | Cause | HTTP |
|---|---|---|
| `INVALID_JSON` | malformed body / missing `expression` field | 400 |
| `UNKNOWN_OPERATOR` | operator key not in registry | 400 |
| `INVALID_OPERAND_COUNT` | wrong arity | 400 |
| `INVALID_NUMBER` | operand string not parseable by `strconv.ParseFloat` | 400 |
| `DIVISION_BY_ZERO` | denominator == 0 | 400 |
| `RESULT_OUT_OF_RANGE` | overflow → ±Inf/NaN | 400 |
| `INTERNAL_ERROR` | anything unexpected | 500 |

All client-caused failures return 400, keeping the mapping simple: `errors.As(err, &evalErr)` → 400 with the `EvalError`'s code; anything else → 500.

### 1.5 REST endpoint

`POST /api/v1/calculations`

Request:
```json
{ "expression": { "+": ["12", "5"] } }
```
Response `200 OK`:
```json
{ "result": "17" }
```

Nested example — `(5+1)/3`:
```json
{ "expression": { "/": [ { "+": ["5", "1"] }, "3" ] } }
```
→ `{ "result": "2" }`

Error example — division by zero, `400 Bad Request`:
```json
{ "error": { "code": "DIVISION_BY_ZERO", "message": "division by zero" } }
```

`result` is returned as a **string** (`strconv.FormatFloat(v, 'f', -1, 64)`) for symmetry with the string-number input contract and to sidestep float-serialization ambiguity — this also lets the frontend feed the result straight back into the next request's operand list without any parsing.

### 1.6 Handler / router

```go
// internal/api/handler/calculation_handler.go
func (h *CalculationHandler) Create(c *gin.Context) {
	var req dto.CalculationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		middleware.RespondError(c, 400, "INVALID_JSON", err.Error())
		return
	}
	result, err := expression.Evaluate(req.Expression)
	if err != nil {
		var evalErr *expression.EvalError
		if errors.As(err, &evalErr) {
			middleware.RespondError(c, 400, evalErr.Code, evalErr.Message)
			return
		}
		middleware.RespondError(c, 500, "INTERNAL_ERROR", "unexpected error")
		return
	}
	c.JSON(200, dto.CalculationResponse{Result: formatResult(result)})
}
```

`router.go` exposes `func NewRouter() *gin.Engine` (not just `main`'s private wiring) so both handler-level tests and the integration test in 1.7 can construct the real, fully-wired router: `v1 := r.Group("/api/v1"); v1.POST("/calculations", handler.Create)`. `main.go` calls `NewRouter().Run(":8080")`.

`router.go` also registers `/healthz` (returns `200 OK`, no body) for both `GET` and `HEAD` alongside the API routes. This isn't part of the calculator domain — it exists purely so the containerized e2e suite (§3) can detect when the backend container is actually ready to accept requests, rather than just "started." (Both methods matter: Gin does not implicitly answer `HEAD` for a route registered only via `.GET()`, and the readiness tooling in §3.2 probes with `HEAD` by default — see the bug writeup there.)

### 1.7 Testing

**Unit tests:**
- `internal/expression/evaluator_test.go` — table-driven cases: each operator's happy path, nested trees, unknown operator, wrong arity (0/1/3 operands), unparsable literal, division by zero, overflow.
- `internal/expression/node_test.go` — JSON unmarshal edge cases: plain string, single-key object, multi-key object (must error), nested operand.
- `internal/api/handler/calculation_handler_test.go` — handler in isolation via `gin.CreateTestContext`, covering the same success/error matrix at the HTTP-binding layer.

**Integration tests (new requirement):**
- `internal/api/router_integration_test.go` — builds the **real** router via `api.NewRouter()`, wraps it in `httptest.NewServer(router)`, and drives it with an actual `net/http.Client` making real HTTP requests over a real socket (no mocking of Gin internals). Table-driven, covering:
  - Happy path: `POST /api/v1/calculations` for each of the 4 operators, plus a nested expression (`(5+1)/3`), asserting exact status code and JSON body.
  - Error cases end-to-end: malformed JSON body, unknown operator, wrong operand count, non-numeric literal, division by zero — asserting status code and the exact `{"error": {...}}` envelope as it would actually appear over the wire.
- This is the layer that proves routing + middleware + binding + evaluation are wired correctly together, distinct from the handler unit test which calls the handler function directly.

Coverage: `go test ./... -coverprofile=coverage.out && go tool cover -func=coverage.out` (summary) and `go tool cover -html=coverage.out -o coverage.html` (report artifact, referenced from README). Integration tests run in the same `go test ./...` invocation (same module, tagged only by directory/filename, no build tags needed since they don't require external services).

---

## 2. Frontend (React + TypeScript + Tailwind)

### 2.1 Tooling

**Vite** — fastest TS/React SPA scaffold, first-class Vitest integration for the coverage requirement, and trivial dev-server proxying (`server.proxy`) to avoid CORS/env-branching between local dev and Docker.

**Tailwind CSS** for all styling (per adjustment #10): `tailwindcss` + `postcss` + `autoprefixer`, wired into the Vite build via `postcss.config.js`. No hand-written `.css` files beyond the Tailwind entrypoint — all component styling is utility classes in JSX, including the responsive/mobile-friendly breakpoints (`sm:`, `md:` variants) instead of custom media queries.

### 2.2 Directory layout

```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css               # @tailwind base; @tailwind components; @tailwind utilities;
│   ├── api/
│   │   ├── types.ts            # ExpressionNode, CalculationResponse, ApiError — mirrors backend contract
│   │   ├── client.ts           # evaluate(expression): Promise<string>
│   │   └── client.test.ts
│   ├── calculator/
│   │   ├── types.ts            # CalculatorState, Operator, Action
│   │   ├── reducer.ts          # pure state machine
│   │   ├── reducer.test.ts
│   │   ├── formatDisplay.ts    # pure fn: CalculatorState -> string (the full-expression display)
│   │   ├── formatDisplay.test.ts
│   │   ├── buildExpressionTree.ts   # pure fn: (a, op, b) -> ExpressionNode
│   │   └── buildExpressionTree.test.ts
│   └── components/
│       ├── Calculator.tsx      # wires reducer + api client
│       ├── Display.tsx
│       ├── Keypad.tsx
│       ├── Key.tsx
│       ├── ErrorMessage.tsx
│       └── Calculator.test.tsx # RTL, click sequences
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── vite.config.ts              # includes `test` block for Vitest + coverage, and dev proxy for /api
├── Dockerfile
├── nginx.conf
└── .dockerignore
```

### 2.3 State model — full expression display + answer-replace semantics

```ts
// calculator/types.ts
export type Operator = '+' | '-' | '*' | '/';

export interface CalculatorState {
  currentOperand: string;          // the operand currently being typed, default "0"
  previousOperand: string | null;  // operand already committed to the pending operation
  operator: Operator | null;       // pending operator, if any
  result: string | null;           // last computed result, set only right after a successful "="
  hasFreshResult: boolean;         // true immediately after "=" succeeds; governs answer-replace behavior
  error: { code: string; message: string } | null;
  isLoading: boolean;
}
```

Operands are kept as **strings throughout**, not numbers — matches the backend's string-number contract end-to-end, avoids float round-tripping on the client, and means the frontend never implements arithmetic itself (single source of truth stays the Go evaluator).

**Display formatting** (`formatDisplay`, pure function, adjustment #11 — the whole expression is visible while composing):
- if `error` is set → the error message is shown (via `ErrorMessage`), not the numeric display.
- else if `hasFreshResult` → show `result` alone (e.g. `"17"`).
- else if `operator` is set → show `` `${previousOperand} ${operatorSymbol} ${currentOperand}` `` (e.g. `"12 + 5"`), so the full in-progress expression is always on screen, not just the current operand.
- else → show `currentOperand` alone (e.g. `"12"`).

**Digit press** (adjustment #12 — answer-replace):
- if `hasFreshResult` is true (a result is currently displayed) → **replace**: start a brand-new calculation from scratch — `currentOperand = digit`, `previousOperand = null`, `operator = null`, `result = null`, `hasFreshResult = false`.
- else if an operator was just pressed and no digits typed yet for the new operand → `currentOperand` starts fresh with the pressed digit.
- else → digit is appended to `currentOperand` (with a decimal-point guard: no second `.`).
- The same replace behavior applies when `error` is set — pressing a digit clears the error and starts fresh, since leaving a stale error on screen while typing a new number would be confusing.

**Operator press** (unchanged "reuse last result" behavior — only digit presses replace, per adjustment #12):
- if `hasFreshResult` is true → **chain from the result**: `previousOperand = result`, `operator = <pressed>`, `currentOperand = ""`, `hasFreshResult = false`.
- else if a `previousOperand`/`operator` pair is already pending (mid-chain, e.g. `5 + 3` then another operator pressed before `=`) → resolve the pending pair immediately via POST, then set `previousOperand` to that result and `operator` to the newly pressed one (standard left-to-right chaining calculator behavior).
- else → capture the current entry: `previousOperand = currentOperand`, `operator = <pressed>`, `currentOperand = ""`.

**Equals press**: POST `{ expression: buildExpressionTree(previousOperand, operator, currentOperand) }`. On success: `result = response.result`, `hasFreshResult = true`, clears `previousOperand`/`operator`/`error`. On failure: `error` is set (from the response's `{code, message}`), display defers to `ErrorMessage`.

**Clear**: resets everything — `currentOperand:"0", previousOperand:null, operator:null, result:null, hasFreshResult:false, error:null`.

Worked example — `12 + 5 =` (full expression visible throughout):
1. `1`,`2` → display `"12"`
2. `+` → `previousOperand:"12"`, `operator:"+"`, `currentOperand:""` → display `"12 +"`
3. `5` → `currentOperand:"5"` → display `"12 + 5"`
4. `=` → POST `{"expression":{"+":["12","5"]}}` → `{"result":"17"}` → `result:"17"`, `hasFreshResult:true` → display `"17"`

Worked example — chaining from the result, `(previous answer) * 3 =`, continuing from `display:"17"`:
1. `*` (operator, not digit) → `previousOperand:"17"` (from `result`), `operator:"*"`, `hasFreshResult:false` → display `"17 *"`
2. `3` → `currentOperand:"3"` → display `"17 * 3"`
3. `=` → POST `{"expression":{"*":["17","3"]}}` → `{"result":"51"}` → display `"51"`

Worked example — answer-replace, continuing from `display:"17"`, `hasFreshResult:true`:
1. `3` (digit, not operator) → per adjustment #12, this **replaces** the answer rather than chaining: `currentOperand:"3"`, `previousOperand:null`, `operator:null`, `result:null`, `hasFreshResult:false` → display `"3"`, a fully fresh calculation.

`buildExpressionTree(a: string, op: Operator, b: string): ExpressionNode` is a pure, trivially-unit-testable function: `{ [op]: [a, b] }`. The `ExpressionNode` TS type is a structural mirror of the Go type: `type ExpressionNode = string | Record<string, ExpressionNode[]>`.

**Requirement (no reusable answer yet)**: resolved by construction — there is no dedicated "Ans" key. Chaining always derives `previousOperand` from either the typed buffer or `result`, both always well-defined strings (default `"0"` on fresh load). It is structurally impossible to reference a nonexistent previous answer.

### 2.4 Components

- `Keypad.tsx`: digits 0–9, `.`, `+ - * /`, `=`, `C` (Clear). Tailwind grid: `grid grid-cols-4 gap-2`.
- `Display.tsx`: renders `formatDisplay(state)` right-aligned, large monospace-ish numerals (`text-4xl font-mono text-right`); when `error` is set, renders `ErrorMessage` instead (distinct color, e.g. `text-red-500`).
- `Key.tsx`: shared button styling (`bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-lg text-xl` etc.), operator/equals/clear keys visually distinguished via Tailwind color variants (e.g. amber for operators, red for clear).
- Responsive layout: a centered `max-w-sm` card on larger screens, full-width with Tailwind's default breakpoints (`sm:`) collapsing padding/sizing on narrow viewports — no custom media-query CSS needed.

### 2.5 API client

```ts
// api/client.ts
export async function evaluate(expression: ExpressionNode): Promise<string> {
  const res = await fetch('/api/v1/calculations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expression }),
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(body.error.code, body.error.message);
  return body.result;
}
```

Using the **relative path `/api/v1/...`** everywhere (not an absolute base URL) is deliberate: in Docker Compose, nginx proxies `/api/` to the backend container; in local `npm run dev`, `vite.config.ts`'s `server.proxy` does the same to `http://localhost:8080`. One code path, no env-var branching, no CORS in either environment.

### 2.6 Testing (unit/component level)

- `buildExpressionTree.test.ts` — pure function, simple/nested cases.
- `formatDisplay.test.ts` — every display mode: plain operand, live expression (`"12 + 5"`), fresh result, error.
- `reducer.test.ts` — every transition: digits, decimal-point guard, operator capture, mid-chain operator resolution, clear, **answer-replace on digit after result**, **chain-from-result on operator after result**, error-then-digit clears error.
- `client.test.ts` — mock global `fetch`, assert request shape and both success/error parsing.
- `Calculator.test.tsx` — RTL `userEvent` click sequences: `1,2,+,5,=` → expect `"17"`; a division-by-zero flow with mocked client rejection → expect error message rendered; result then digit → expect display shows only the new digit (answer replaced).
- Coverage: `@vitest/coverage-v8`, configured in `vite.config.ts`'s `test.coverage` block; run via `npm run test -- --coverage`, producing text summary + `coverage/` HTML report.

---

## 3. End-to-end integration tests (cross-service, containerized — new requirement)

Unit and per-layer integration tests (1.7, 2.6) don't prove the frontend and backend actually work together over real HTTP in a real browser. A root-level **Playwright** suite closes that gap by driving the real UI against the real backend for both the happy path and error cases — and per adjustment #14, it must run in a container so nobody needs Node, Go, Playwright, or browser binaries installed locally; **Docker is the only prerequisite**.

```
/
├── e2e/
│   ├── Dockerfile              # Playwright's official image, already has browsers preinstalled
│   ├── happy-path.spec.ts      # full keypad-driven flows, asserting on-screen text
│   └── error-cases.spec.ts     # division by zero, etc., asserting the rendered error message
├── playwright.config.ts         # baseURL + optional local-only webServer block (see below)
└── package.json                  # devDependency: @playwright/test, wait-on; script: "test:e2e": "playwright test"
```

### 3.1 Two ways to run it

- **Containerized (no environment setup — the required path)**: `docker compose --profile e2e up --build --abort-on-container-exit --exit-code-from e2e` from the repo root. This builds `backend`, `frontend`, and `e2e` and runs the suite against the real containers over the Compose network. Nothing needs to be installed beyond Docker.
- **Local (optional, for fast iteration while developing tests)**: `npm run test:e2e` from root, with Node/Go installed — `playwright.config.ts` falls back to spawning `go run ./cmd/server` and `npm run preview` itself via its `webServer` option when no external base URL is provided.

`playwright.config.ts` picks the mode based on an env var, so the same spec files work both ways:

```ts
const baseURL = process.env.PLAYWRIGHT_BASE_URL; // set by docker-compose for the containerized run

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: baseURL ?? 'http://localhost:4173' },
  // Only spawn local dev servers when we're NOT pointed at already-running containers.
  webServer: baseURL ? undefined : [
    { command: 'go run ./cmd/server', cwd: '../backend', port: 8080, reuseExistingServer: !process.env.CI },
    { command: 'npm run preview', cwd: '../frontend', port: 4173, reuseExistingServer: !process.env.CI },
  ],
});
```

### 3.2 `e2e/Dockerfile`

**Revised from the original plan** (which called for Microsoft's official `mcr.microsoft.com/playwright` image): that image ships Chromium *and* Firefox *and* WebKit plus all their OS dependencies/fonts, several GB in total, even though the suite only ever runs the default (Chromium) project. On a first cold pull this was slow enough to look "stuck." Built instead from a slim Node base with only Chromium installed:

```dockerfile
FROM node:20-bookworm-slim
WORKDIR /e2e
COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium
COPY playwright.config.ts ./
COPY e2e ./e2e
CMD ["sh", "-c", "npx wait-on -t 60000 http-get://backend:8080/healthz http-get://frontend:80 && npx playwright test"]
```

The build context is the repo root (`context: .` in Compose, `dockerfile: e2e/Dockerfile`) so it can pull in the root `package.json`/`playwright.config.ts` alongside `e2e/`. Measured cold-build time (no layer cache): ~2m20s; warm rebuilds: a few seconds.

`wait-on` (a small devDependency) polls the backend's `GET /healthz` (§1.6) and the frontend's `/` before starting Playwright, so the suite doesn't race container startup — this is simpler than Compose `healthcheck:`/`depends_on: condition: service_healthy` wiring, and keeps the backend's minimal distroless image free of a shell or curl/wget just for health-checking.

**Bug found and fixed during verification**: `wait-on`'s default check for a plain `http://` target is a `HEAD` request. Gin does not implicitly answer `HEAD` for a route registered only via `.GET()`, so the readiness probe 404'd in a loop forever — with no timeout on the original `wait-on` invocation, this hung the entire `docker compose --profile e2e up` run indefinitely (exactly the "gets stuck, doesn't finish" symptom). Fixed on both sides: the backend's `/healthz` now registers both `GET` and `HEAD` (§1.6), and the `wait-on` invocation above uses the explicit `http-get://` scheme (forcing `GET`) plus a bounded `-t 60000` timeout, so any future readiness regression fails fast with a clear error instead of hanging silently.

### 3.3 Compose wiring (full block in §4)

An `e2e` service is added to the root `docker-compose.yml` under an `e2e` [Compose profile](https://docs.docker.com/compose/how-tos/profiles/), so it never starts on a normal `docker compose up` (which should just run the app) — only when explicitly requested with `--profile e2e`. It sets `PLAYWRIGHT_BASE_URL=http://frontend:80`, i.e. the frontend's Compose service name/port, reachable only on the internal Compose network.

### 3.4 Test coverage

- **Happy path** (`happy-path.spec.ts`): open the app, click `1,2,+,5,=`, assert the display shows `17`; then click `*,3,=` and assert `51` (proves result-reuse/chaining works through a real network round trip); assert the expression is visible mid-entry (e.g. after `1,2,+` the display reads `12 +`).
- **Error cases** (`error-cases.spec.ts`): click `5,/,0,=`, assert the rendered error message text (e.g. "division by zero") appears on screen, sourced from the real backend's `DIVISION_BY_ZERO` response — not a mocked one; then click a digit and assert the error clears and the new digit replaces the display.

This is the suite that actually exercises: browser → fetch → nginx proxy → Gin router → handler → evaluator → JSON response → React re-render, end to end, entirely inside Docker.

---

## 4. Docker

**`backend/Dockerfile`** (multi-stage):
```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /bin/server ./cmd/server

FROM gcr.io/distroless/static-debian12
COPY --from=builder /bin/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

**`frontend/Dockerfile`** (build + static-serve via nginx):
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

Tailwind is a build-time PostCSS step inside `npm run build` — no changes needed to the Dockerfile beyond what's already there.

`nginx.conf`: SPA fallback (`try_files $uri /index.html`) plus `location /api/ { proxy_pass http://backend:8080/api/; }`.

**`docker-compose.yml`** (root):
```yaml
services:
  backend:
    build: ./backend
    ports: ["8080:8080"]

  frontend:
    build: ./frontend
    ports: ["3000:80"]
    depends_on: [backend]

  e2e:
    profiles: ["e2e"]           # never starts on a plain `docker compose up`
    build:
      context: .
      dockerfile: e2e/Dockerfile
    environment:
      PLAYWRIGHT_BASE_URL: http://frontend:80
    depends_on: [backend, frontend]
    volumes:
      - ./playwright-report:/e2e/playwright-report
```

`docker compose up --build` → app on `http://localhost:3000`, calling the backend transparently through the nginx proxy. The `e2e` service (§3) only runs when explicitly requested: `docker compose --profile e2e up --build --abort-on-container-exit --exit-code-from e2e`.

---

## 5. Root README contents

- Prerequisites (Go 1.22+, Node 20+, Docker).
- Local dev without Docker: `cd backend && go run ./cmd/server`; `cd frontend && npm install && npm run dev` (Vite proxy forwards `/api` to `:8080`).
- Docker Compose usage.
- API reference with curl examples (simple, nested, and each error case).
- Testing & coverage commands for both layers, plus how to run the Playwright e2e suite: the containerized one-liner (`docker compose --profile e2e up --build --abort-on-container-exit --exit-code-from e2e`, no local installs needed) as the primary documented path, with the local `npm install && npx playwright install && npm run test:e2e` route noted as an optional fast-iteration alternative.
- Design decisions/assumptions section: expression-tree shape and why it's LISP-prefix-keyed, string-typed numbers and `strconv.ParseFloat`, client-side-only state with a stateless backend, registry-based evaluator for extensibility, full-expression display + answer-replace semantics, and the "no reusable answer yet" resolution.
- Project structure tree.

---

## Ambiguities resolved with a default (flagged for review)

1. **Division-by-zero HTTP status**: used 400 (validation-style) rather than 422, per the spec's own wording that groups it with other 400 validation errors. Easy to switch to 422 if preferred.
2. **Result precision/formatting**: `strconv.FormatFloat(v, 'f', -1, 64)` (shortest round-trippable decimal, no fixed rounding). Repeating decimals (e.g. `1/3`) will print many digits; no rounding/precision config was specified, so none was added.
3. **Arity of `+`/`*`**: kept strictly binary (arity 2) for all four MVP operators to match "no missing operands for binary ops" literally, even though the registry's `MinArity/MaxArity` fields are already shaped to support a future variadic n-ary `+`/`*` with a one-line change.
4. **UI does not expose parentheses/grouping controls** in this MVP keypad — only single binary operations per POST — even though the tree data model and evaluator already fully support arbitrary nesting for a future "advanced mode" UI.
5. **Overflow handling**: added a non-required `RESULT_OUT_OF_RANGE` check (`math.IsInf`/`IsNaN` after eval) as a small robustness addition beyond the literal spec text.
6. **Go module path / package names**: used generic, non-published module paths (e.g. `module calculator-backend`) since there's no remote repo path given; trivial to rename.
7. **Error-then-digit clears the error**: not explicitly specified, but treating a stale error the same as a stale answer (replaced on next digit press) keeps the UX consistent with adjustment #12.
8. **Playwright over Cypress** for e2e: chosen for native multi-server `webServer` orchestration (useful for the optional local mode) and an official pre-built browser image, which makes containerizing it (adjustment #14) straightforward.
9. **`wait-on` polling over Compose `healthcheck:`/`depends_on: condition: service_healthy`**: keeps the backend's minimal distroless final image free of a shell/curl/wget purely for health-checking; the `e2e` container does the polling itself instead.

## Critical files for implementation

- `backend/internal/expression/node.go`
- `backend/internal/expression/evaluator.go`
- `backend/internal/api/router.go` / `router_integration_test.go`
- `frontend/src/calculator/reducer.ts`
- `frontend/src/calculator/formatDisplay.ts`
- `frontend/src/api/client.ts`
- `e2e/happy-path.spec.ts` / `e2e/error-cases.spec.ts` / `e2e/Dockerfile`
- `docker-compose.yml`

## Verification

- Backend: `go test ./... -cover` all green, including the new router integration tests; manual curl against `POST /api/v1/calculations` for the worked examples above (simple, nested, each error code).
- Frontend: `npm run test -- --coverage` all green; `npm run dev` and manually drive the keypad through both worked examples plus a division-by-zero case, confirming full-expression display and answer-replace behavior visually.
- End-to-end (containerized, no local setup): `docker compose --profile e2e up --build --abort-on-container-exit --exit-code-from e2e` from root — happy path + error cases against the real containerized backend/frontend.
- Full stack: `docker compose up --build`, load `http://localhost:3000`, repeat the manual keypad checks through the proxied API.
