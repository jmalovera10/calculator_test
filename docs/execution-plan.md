# Execution Plan — Full-Stack Calculator

Task breakdown derived from `docs/implementation-plan.md`, structured for parallel execution. Task IDs (`#1`–`#24`) correspond 1:1 to the tracked tasks in the session's task list (`TaskList`/`TaskGet`).

## Parallel tracks

Three tracks can run concurrently. Track A (backend) and Track B (frontend) are fully independent of each other. Track C (infra/e2e) joins them once both produce a Dockerfile, and the docs/verification tasks close out everything at the end.

```
Track A (Backend)            Track B (Frontend)           Track C (Infra / e2e)
─────────────────            ──────────────────           ──────────────────────
#1 Scaffold Go project       #10 Scaffold Vite+Tailwind    #19 Playwright config + pkg.json
   │                             │                             │
#2 Expression Node type       #11 Frontend TS types          #20 e2e Dockerfile
   │                             │  │
#3 Operator registry          │  #12 Pure functions           │
   │                          │      │                        │
#4 DTOs + middleware ─┐       │  #13 Reducer                  │
   │                  │       │      │                        │
   └──────► #5 Handler ◄──────┘  #14 API client ◄──────────────┘ (needs #11)
             │                       │      │
            #6 Router/healthz        └──►#15 UI components
             │  │                            │  │
   ┌─────────┘  │                       ┌────┘  │
#7 Integration   #8 Backend Dockerfile  #16 Frontend    #17 Frontend
   tests            │                      Dockerfile      coverage
   │                │                       │
   └──────┬─────────┘                       │
        #9 Backend                          │
          coverage                          │
             │                              │
             └──────────┬───────────────────┘
                    #18 Root docker-compose.yml (needs #8 + #16)
                         │
                    #21 e2e specs (needs #18 + #20)
                         │
                    #22 Wire e2e into compose
                         │
        ┌────────────────┴───────────────────┐
        │  #23 Rewrite README (needs #9,#17,#22)
        │                │
        └────────────────┴──── #24 Full verification pass
```

## Immediately startable (no blockers)

- **#1** — Scaffold Go backend project
- **#10** — Scaffold Vite React TS project with Tailwind
- **#19** — Scaffold root Playwright config and package.json

These three can be worked in parallel (e.g. as separate background agents), since they touch entirely disjoint file trees (`backend/`, `frontend/`, root `playwright.config.ts`/`package.json`).

## Track A — Backend (Go + Gin)

| # | Task | Blocked by |
|---|---|---|
| 1 | Scaffold Go backend project (go.mod, cmd/server, internal/ layout, Makefile) | — |
| 2 | Implement expression tree type (Node + UnmarshalJSON) + node_test.go | 1 |
| 3 | Implement operator registry evaluator + evaluator_test.go | 2 |
| 4 | Implement DTOs and error middleware | 1 |
| 5 | Implement calculation handler + handler_test.go | 3, 4 |
| 6 | Implement router with `/healthz` and `/api/v1/calculations` | 5 |
| 7 | Write backend HTTP integration tests (real router, real HTTP) | 6 |
| 8 | Write backend Dockerfile | 6 |
| 9 | Generate backend coverage report | 7, 8 |

## Track B — Frontend (React + TS + Tailwind)

| # | Task | Blocked by |
|---|---|---|
| 10 | Scaffold Vite React TS project with Tailwind | — |
| 11 | Define frontend TS types (ExpressionNode, CalculatorState) | 10 |
| 12 | Implement pure calculator functions (buildExpressionTree, formatDisplay) + tests | 11 |
| 13 | Implement calculator reducer + reducer.test.ts | 12 |
| 14 | Implement frontend API client + client.test.ts | 11 |
| 15 | Implement calculator UI components + Calculator.test.tsx | 13, 14 |
| 16 | Write frontend Dockerfile and nginx config | 15 |
| 17 | Generate frontend coverage report | 15 |

## Track C — Infra / e2e / Docs

| # | Task | Blocked by |
|---|---|---|
| 18 | Write root docker-compose.yml (backend + frontend services) | 8, 16 |
| 19 | Scaffold root Playwright config and package.json | — |
| 20 | Write e2e Dockerfile (official Playwright image) | 19 |
| 21 | Write e2e Playwright specs (happy path + error cases) | 18, 20 |
| 22 | Wire e2e service into docker-compose (profile, wait-on, healthz) | 21 |
| 23 | Rewrite root README (setup, API examples, design decisions) | 9, 17, 22 |
| 24 | Run full verification pass (unit + integration + e2e + docker compose up) | 23 |

## Notes on parallelization

- Within Track A, #2/#3 (expression engine) and #4 (DTOs/middleware) can be split across two workers since neither touches the other's files; both must land before #5 (handler) integrates them.
- Within Track B, #13 (reducer) and #14 (API client) can be split across two workers once #11 (types) lands; both must land before #15 (components) wires them together.
- #7 (integration tests) and #8 (Dockerfile) can be done in parallel once #6 (router) exists.
- #16 (frontend Dockerfile) and #17 (frontend coverage) can be done in parallel once #15 (components) exists.
- Track C's #18 is the first hard join point between backend and frontend (needs both Dockerfiles); #21 is the second (needs the compose file and the e2e Dockerfile).
