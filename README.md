# Calculator

A full-stack calculator: a React (TypeScript + Tailwind) frontend backed by a Go (Gin) REST API. Supports addition, subtraction, multiplication, and division, built on an expression-tree contract designed to extend to composed/grouped operations later.

```
/
├── backend/     Go + Gin REST API (stateless expression evaluator)
├── frontend/    React + TypeScript + Tailwind SPA
├── e2e/         Cross-service Playwright end-to-end tests (containerized)
├── docs/        Objective spec, implementation plan, execution plan
└── docker-compose.yml
```

## Prerequisites

- Docker + Docker Compose (for the one-command paths below)
- Go 1.25+ (for local backend dev)
- Node.js 20+ (for local frontend dev)

## Running it

### Docker Compose (recommended — no local Go/Node setup needed)

```bash
docker compose up --build
```

Open **http://localhost:3000**. The frontend container (nginx) serves the built SPA and proxies `/api/` to the backend container.

### Local development (without Docker)

```bash
# terminal 1
cd backend && go run ./cmd/server        # http://localhost:8080

# terminal 2
cd frontend && npm install && npm run dev  # http://localhost:5173
```

Vite's dev server proxies `/api` to `localhost:8080` (`frontend/vite.config.ts`), so the frontend code never needs to know which mode it's running in — it always calls the relative path `/api/v1/calculations`.

## API reference

`POST /api/v1/calculations`

Expressions are a LISP-prefix-style JSON tree: an operator key maps to an array of operands, and each operand is either a **number string** or a nested operator object. This shape is deliberately open to future composition/grouping (e.g. `(5 + 1) / 3`) even though only the four basic operators are implemented today.

**Simple:**
```bash
curl -X POST http://localhost:8080/api/v1/calculations \
  -H 'Content-Type: application/json' \
  -d '{"expression": {"+": ["12", "5"]}}'
# {"result":"17"}
```

**Nested — `(5 + 1) / 3`:**
```bash
curl -X POST http://localhost:8080/api/v1/calculations \
  -H 'Content-Type: application/json' \
  -d '{"expression": {"/": [{"+": ["5", "1"]}, "3"]}}'
# {"result":"2"}
```

**Errors** — always a `4xx`/`5xx` status with a `{"error": {"code", "message"}}` envelope:

| Code | Cause | HTTP |
|---|---|---|
| `INVALID_JSON` | malformed body / missing `expression` field | 400 |
| `UNKNOWN_OPERATOR` | operator key not one of `+ - * /` | 400 |
| `INVALID_OPERAND_COUNT` | wrong number of operands (all four ops are strictly binary) | 400 |
| `INVALID_NUMBER` | an operand string isn't a parseable number | 400 |
| `DIVISION_BY_ZERO` | denominator is `0` | 400 |
| `NEGATIVE_SQRT` | `sqrt` operand is negative | 400 |
| `RESULT_OUT_OF_RANGE` | result overflows to `±Inf`/`NaN` | 400 |
| `INTERNAL_ERROR` | anything unexpected | 500 |

```bash
curl -X POST http://localhost:8080/api/v1/calculations \
  -H 'Content-Type: application/json' \
  -d '{"expression": {"/": ["5", "0"]}}'
# {"error":{"code":"DIVISION_BY_ZERO","message":"division by zero"}}
```

**Optional operations — exponentiation (`^`), square root (`sqrt`), percentage (`%`):**

`sqrt` and `%` are unary — their operand array holds exactly one element.

```bash
curl -X POST http://localhost:8080/api/v1/calculations \
  -H 'Content-Type: application/json' \
  -d '{"expression": {"^": ["2", "10"]}}'
# {"result":"1024"}

curl -X POST http://localhost:8080/api/v1/calculations \
  -H 'Content-Type: application/json' \
  -d '{"expression": {"sqrt": ["9"]}}'
# {"result":"3"}

curl -X POST http://localhost:8080/api/v1/calculations \
  -H 'Content-Type: application/json' \
  -d '{"expression": {"%": ["50"]}}'
# {"result":"0.5"}

curl -X POST http://localhost:8080/api/v1/calculations \
  -H 'Content-Type: application/json' \
  -d '{"expression": {"sqrt": ["-4"]}}'
# {"error":{"code":"NEGATIVE_SQRT","message":"cannot take the square root of a negative number"}}
```

`GET /healthz` returns `200 OK` with no body — used by container orchestration to detect backend readiness, not part of the calculator domain itself.

## Testing

### Backend (Go)

```bash
cd backend
make test    # go test ./...
make cover   # generates coverage.out + coverage.html
```

76 tests across unit level (`internal/expression`: the `Node` JSON unmarshaling and the operator-registry evaluator, including `^`/`sqrt`/`%`; `internal/api/handler`: HTTP binding in isolation) and **integration level** (`internal/api/router_integration_test.go`: the real `NewRouter()` wired up behind a real `httptest.Server`, hit with a real `net/http.Client` — proving routing + middleware + binding + evaluation work together, not just the handler function in isolation, including happy-path and error-path coverage for `^`/`sqrt`/`%`). Current coverage: **94.9%** statements.

### Frontend (React)

```bash
cd frontend
npm run test              # vitest run
npm run test -- --coverage  # + coverage/ HTML report
```

28 tests: pure-function tests (`buildExpressionTree`, `formatDisplay`), the `reducer`'s state transitions (digit entry, operator chaining, clear, answer-replace, error recovery), the API client (mocked `fetch`), and component-level tests (React Testing Library) driving real click sequences through `Calculator`. Current coverage: **80.8%** statements.

### End-to-end (Playwright, containerized)

Exercises the real browser → real backend path for both the happy path and error cases. Runs entirely in Docker — **no local Node/Go/Playwright/browser installation required**:

```bash
docker compose --profile e2e up --build --abort-on-container-exit --exit-code-from e2e
```

This builds `backend`, `frontend`, and an `e2e` container (a slim Node image with only Chromium installed — see below), waits for both services to report ready via `/healthz` and `/`, then runs `e2e/happy-path.spec.ts` and `e2e/error-cases.spec.ts` against them over the real Compose network. The `e2e` service lives behind a Compose **profile**, so it never starts on a plain `docker compose up`. First build takes roughly 2 minutes (Chromium download + OS deps); subsequent runs reuse Docker's layer cache and finish in well under a minute.

For fast iteration while writing specs, you can instead run it locally (requires Node + Go installed): `npm install && npx playwright install && npm run test:e2e` from the repo root — `playwright.config.ts` detects the absence of `PLAYWRIGHT_BASE_URL` and spawns `go run ./cmd/server` + `npm run preview` itself.

## Design decisions & assumptions

- **Expression tree, not a flat request shape.** An operator key maps to an operand array (`{"+": ["12", "5"]}`), and operands nest recursively. This is more than the current scope needs, but it's the shape that lets grouped/composed operations (`(5+1)/3`) be added later without a breaking API change — the recursive evaluator already handles arbitrary nesting today, it's just that the UI/keypad only ever sends two-level trees.
- **Numbers are JSON strings, not JSON numbers**, both in requests and in the `result` field. The Go backend is the single source of truth for parsing (`strconv.ParseFloat`) and formatting (`strconv.FormatFloat`, shortest round-trippable form) — the frontend never does its own arithmetic or float parsing, and results can be fed straight back into the next request's operand list unchanged.
- **The backend is fully stateless.** There is no session, no "last answer" endpoint, no server-side memory of anything. "Reuse the last result" is a client-side concern: the React app keeps its last computed result in local state and substitutes it as an operand into the next request. This keeps the API a pure, trivially-testable function and avoids any session/concurrency design entirely.
- **Operator registry, not an if/else chain.** `internal/expression/evaluator.go`'s `registry` map is what the evaluator dispatches through. Adding a fifth operator (e.g. `^`) later is a one-line map entry, not a rewritten code path.
- **Full expression stays on screen while composing** (e.g. `12 + 5`, not just `5`), and pressing `=` collapses it to the result. Pressing a *digit* right after a result replaces it and starts a new calculation from scratch; pressing an *operator* instead chains from it. This mirrors how a physical calculator behaves and was a specific, deliberate UX requirement — see `frontend/src/calculator/reducer.ts` and `formatDisplay.ts`.
- **"No previous answer to operate with" is resolved by construction, not a guard clause.** There's no dedicated "Ans" key; the previous operand for a chained operation is always derived from either the currently-typed buffer or the last result, both of which are always well-defined strings (default `"0"` on load). It's structurally impossible to reference an answer that doesn't exist yet.
- **Backend validates independently of the frontend.** Even though the UI can't construct a malformed expression through normal use, the API itself rejects unknown operators, wrong operand counts, and unparsable numbers on its own — it doesn't trust the frontend to have done that.
- **Distroless runtime image for the backend** (`gcr.io/distroless/static-debian12`), which has no shell. The e2e container's readiness check therefore polls from *outside* (`wait-on` in the `e2e` container hitting `/healthz`) rather than via a Compose `healthcheck:` that would need a shell inside the backend image.
- **`/healthz` answers both `GET` and `HEAD`.** `wait-on`'s default check for a plain `http://` target is a `HEAD` request; Gin doesn't implicitly answer `HEAD` for a route only registered via `.GET()`. Without this, the readiness probe 404'd forever and the containerized e2e run never started. The e2e Dockerfile also pins `wait-on` to the explicit `http-get://` scheme (forcing `GET`) and a bounded timeout, so a genuine future readiness failure fails fast with a clear error instead of hanging the whole `docker compose` run indefinitely.
- **e2e image is a slim Node base + `playwright install chromium` only**, not the official `mcr.microsoft.com/playwright` image. That image ships Chromium *and* Firefox *and* WebKit plus all their OS deps/fonts (multiple GB) — since the suite only ever runs the default (Chromium) project, that was several GB of dead weight that made a cold pull painfully slow. The slim build is roughly two orders of magnitude smaller to pull/build the first time.
- **Percentage is a simple unary transform (`x -> x/100`), not a relative-to-previous-operand percentage.** Some calculators make `12 + 5%` mean `12 + (12 * 0.05)`; here `%` only ever sees and transforms the single number it was invoked on (`{"%": ["50"]}` → `0.5`), matching its `MinArity: 1, MaxArity: 1` registry entry. This keeps `%` structurally identical to `sqrt` (both unary, both independent of any other pending operand) rather than requiring the evaluator or the frontend's expression builder to special-case a "percent relative to X" tree shape.
- **Negative `sqrt` gets its own `NEGATIVE_SQRT` error code instead of falling through to `RESULT_OUT_OF_RANGE`.** `math.Sqrt` of a negative number returns `NaN`, which the evaluator's generic post-op `IsInf`/`IsNaN` check would otherwise catch as the same generic "not a finite number" error used for overflow. Since a negative radicand is a well-understood, distinct failure mode (not a numeric-range problem), it's raised explicitly and inline in `sqrt`'s own `Eval` closure — same convention as `DIVISION_BY_ZERO` in `/`'s closure — so API consumers can tell the two situations apart.
- **The minus simbol only acts as a binary operator, not as a number modifier**. This means that the minus operator does not immediately turn a number into a negative so an operation like (10 * -20) is not allowed. This might a be an improvement to treat the minus symbol as both a unary or binary operator. 