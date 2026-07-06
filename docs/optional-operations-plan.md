# Optional Operations: Exponentiation, Square Root, Percentage

## Context

`docs/objective.spec.md` lists three optional operations beyond the four basics already implemented: **exponentiation**, **square root**, and **percentage**. The core architecture (Go/Gin operator-registry evaluator, React reducer/state-machine frontend, LISP-prefix JSON expression tree) was explicitly designed to extend to new operators without breaking changes — this is where that design gets exercised.

Two of the three need special handling beyond "just another binary op":
- **Square root** is unary and has an invalid domain (negative radicands must be rejected with a clear error, not silently produce `NaN`).
- **Percentage** is unary — per clarification, it transforms only the single number that was just entered (`x` → `x/100`), it does not implicitly reference a second/previous operand the way some calculators do relative percentages.
- **Exponentiation** is ordinary binary, symmetric with `+ - * /`.

Confirmed via clarifying questions:
- √ and % **evaluate immediately** on key press (call the backend right away and replace the display), not staged until `=`.
- Exponentiation button/key: **`^`**, sent as JSON operator key `"^"`.
- Square root button: **`√`**, sent as JSON operator key `"sqrt"`.
- Percentage button: **`%`**, sent as JSON operator key `"%"`.

## Backend (`backend/`)

All changes are additive to the existing registry pattern — no changes needed to `node.go` (arity-agnostic already), `dto/calculation.go`, `calculation_handler.go`, or `middleware/error.go` (all are generic w.r.t. operator/error code).

**`internal/expression/evaluator.go`** — add three registry entries:
```go
"^": {Symbol: "^", MinArity: 2, MaxArity: 2, Eval: func(o []float64) (float64, error) {
    return math.Pow(o[0], o[1]), nil
}},
"sqrt": {Symbol: "sqrt", MinArity: 1, MaxArity: 1, Eval: func(o []float64) (float64, error) {
    if o[0] < 0 {
        return 0, &EvalError{Code: "NEGATIVE_SQRT", Message: "cannot take the square root of a negative number"}
    }
    return math.Sqrt(o[0]), nil
}},
"%": {Symbol: "%", MinArity: 1, MaxArity: 1, Eval: func(o []float64) (float64, error) {
    return o[0] / 100, nil
}},
```
- `math` is already imported in this file (used for `IsInf`/`IsNaN`); `math.Pow`/`math.Sqrt` need no new import.
- Overflow from `^` (e.g. huge exponents) and `NaN` from a negative-base/fractional-exponent `^` are already caught generically by `Evaluate`'s existing post-op `IsInf`/`IsNaN` check → `RESULT_OUT_OF_RANGE`. Only the negative-sqrt domain error needs an explicit, semantically-named code (`NEGATIVE_SQRT`) since `math.Sqrt(negative)` returns `NaN`, which would otherwise be indistinguishable from any other range error.
- New error code `NEGATIVE_SQRT` follows the existing convention (inline `&EvalError{...}` in the operator's own `Eval` closure, same as `DIVISION_BY_ZERO`) — there is no central error-code registry to update.

**`internal/expression/evaluator_test.go`**:
- ⚠️ `TestEvaluate_Errors` currently uses `op("^", ...)` as its example of an *unknown* operator. Once `^` is registered, that case must be changed to a different placeholder (e.g. `"@"`).
- Add happy-path rows: `^` (e.g. `2^10 = 1024`), `sqrt` (e.g. `sqrt(9) = 3`), `%` (e.g. `50% = 0.5`), and at least one nested case combining a new op with an existing one (e.g. `1 + sqrt(16) = 5`).
- Add error rows: negative sqrt → `NEGATIVE_SQRT`; wrong arity for each new op (0 or 2 operands to `sqrt`/`%`, 1 or 3 to `^`) → `INVALID_OPERAND_COUNT` (proves the generic arity check covers the new registry entries with no special-case code).

**`README.md`**: add `NEGATIVE_SQRT` to the error code table; add `^`/`sqrt`/`%` curl examples; extend the design-decisions section with a short note on the percentage semantics decision (simple unary transform, not relative-to-previous-operand) and why negative sqrt gets its own code.

## Frontend (`frontend/src/`)

Because √/% evaluate immediately via the backend (no local math, consistent with the rest of the app), the design turns out to need **no new display branches and no new `CalculatorState` fields** — only one new reducer action and one new hook callback.

**`calculator/types.ts`**:
```ts
export type Operator = '+' | '-' | '*' | '/' | '^'          // ^ joins the existing binary union, zero special-casing elsewhere
export type UnaryOperator = 'sqrt' | '%'

// added to the Action union:
| { type: 'UNARY_EVAL_SUCCESS'; result: string }
```
`EVAL_START` and `EVAL_ERROR` are reused as-is for unary calls — no new variants needed for those.

**`calculator/reducer.ts`** — add one case:
```ts
case 'UNARY_EVAL_SUCCESS': {
  const isStandalone = state.previousOperand === null && state.operator === null
  return {
    ...state,
    currentOperand: action.result,
    result: isStandalone ? action.result : state.result,
    hasFreshResult: isStandalone,
    isLoading: false,
    error: null,
  }
}
```
Why the `isStandalone` branch matters: if a unary op fires while a binary chain is already pending (e.g. `12 +` then `9` then `√`), we must **not** set `hasFreshResult` — doing so would make `pressOperator`'s mid-chain detection (`previousOperand !== null && operator !== null`) look like a finished top-level result and wrongly discard `previousOperand`/`operator` (i.e. `12 +` would be lost). By only replacing `currentOperand` and leaving `previousOperand`/`operator` untouched, the *existing* `pressOperator`/`pressEquals` mid-chain-resolution logic in `useCalculator.ts` (unchanged) correctly picks up `("12", "+", "3")` afterward. When there's no pending chain, behaving exactly like a normal `EVAL_SUCCESS` (fresh result, replace-on-next-digit) keeps unary results consistent with the existing "digit after result replaces" rule.

**`calculator/buildExpressionTree.ts`** — add a sibling function (the existing `ExpressionNode = string | Record<string, ExpressionNode[]>` type already supports single-element arrays, no type changes needed):
```ts
export function buildUnaryExpressionTree(op: UnaryOperator, a: string): ExpressionNode {
  return { [op]: [a] }
}
```

**`calculator/useCalculator.ts`** — add, mirroring the existing `runEvaluation`/`pressOperator` pattern:
```ts
const runUnaryEvaluation = useCallback(async (operator: UnaryOperator, operand: string) => {
  dispatch({ type: 'EVAL_START' })
  try {
    const result = await evaluate(buildUnaryExpressionTree(operator, operand))
    dispatch({ type: 'UNARY_EVAL_SUCCESS', result })
  } catch (err) {
    dispatch({ type: 'EVAL_ERROR', code: ..., message: ... }) // same extraction as runEvaluation's catch block
  }
}, [])

const pressUnaryOperator = useCallback((operator: UnaryOperator) => {
  if (state.isLoading) return
  const operand = state.currentOperand === '' ? '0' : state.currentOperand
  void runUnaryEvaluation(operator, operand)
}, [state, runUnaryEvaluation])
```
`state.currentOperand` is always the right operand source: it already holds a fresh result's value (`EVAL_SUCCESS` sets `currentOperand = result`) or whatever's mid-entry, so no `hasFreshResult` branching is needed here — unlike the reducer side, which does need it. Return `pressUnaryOperator` from the hook.

**`components/Keypad.tsx` / `Key.tsx`** — add three buttons (`√`, `%`, `^`), wired to `pressUnaryOperator('sqrt')`, `pressUnaryOperator('%')`, and `pressOperator('^')` respectively (`^` needs no new plumbing beyond the button itself — it flows through the existing binary path unchanged). Insert as a new row between the `C` row and the `7 8 9 /` row (all existing rows are fully packed at `grid-cols-4`, so a new row is the lowest-risk layout change); reuse the existing `'operator'` `Key` variant for visual consistency. Button visible text must be exactly `√`, `%`, `^` since tests match on exact rendered text.

**Frontend tests to add** (mirroring existing patterns):
- `buildExpressionTree.test.ts` gains a case (or new small file) for `buildUnaryExpressionTree('sqrt', '9')` → `{ sqrt: ['9'] }`.
- `reducer.test.ts` gains a `describe('UNARY_EVAL_SUCCESS', ...)` block covering: standalone case (no pending operator → `hasFreshResult: true`), mid-chain case (`previousOperand`/`operator` set → both preserved, `hasFreshResult: false`).
- `Calculator.test.tsx` (component-level, mocked `fetch`) gains click-driven scenarios: `9 → √ → "3"` displayed; `50 → % → "0.5"`; `2 → ^ → 8 → = → "256"`; negative-sqrt error surfaced via `role="alert"`; a chained case like `12 → + → 9 → √ → = → "15"` to prove the mid-chain preservation logic end-to-end.

## Verification

- `cd backend && make test` (and `make cover` to confirm coverage doesn't regress) — new registry entries and error rows.
- `cd frontend && npm run test -- --coverage` — new reducer/buildExpressionTree/component tests.
- Manual smoke via curl once backend changes land:
  ```bash
  curl -X POST localhost:8080/api/v1/calculations -d '{"expression":{"^":["2","10"]}}'   # {"result":"1024"}
  curl -X POST localhost:8080/api/v1/calculations -d '{"expression":{"sqrt":["-4"]}}'     # NEGATIVE_SQRT, 400
  curl -X POST localhost:8080/api/v1/calculations -d '{"expression":{"%":["50"]}}'        # {"result":"0.5"}
  ```
- `npm run dev` (frontend) + `go run ./cmd/server` (backend) for a manual click-through of √, %, ^, including the chained-through-unary scenario and the negative-sqrt error path in the browser.
