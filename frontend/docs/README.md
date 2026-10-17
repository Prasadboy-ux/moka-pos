# Documentation

The frontend is complete and self-contained. There is no backend, no API route,
and no server dependency — these documents describe what exists and what the
server will have to provide.

| Document | Read it for |
|---|---|
| [PRD.md](./PRD.md) | **What the product does.** Users, the seven screens with acceptance criteria, the business rules, what is deliberately out of scope, and the four decisions needed before the backend. |
| [TRD.md](./TRD.md) | **How it is built.** Stack, the repository seam, the data model, the rules that live in code, routing and permissions, performance and accessibility decisions, and the plan for swapping in a server. |
| [API-CONTRACT.md](./API-CONTRACT.md) | **What the backend must provide.** Every repository method as an HTTP endpoint, request and response shapes, the error envelope, security rules the server owns, and the suggested MongoDB shape. |
| [TESTING.md](./TESTING.md) | **How it is verified.** The 7 suites, what each covers, what is *not* covered, and the conventions to keep. |
| [DESIGN.md](./DESIGN.md) | **How it looks and behaves.** Brand tokens, locale, touch targets, motion, focus, the print rules and their traps, and a checklist for adding a screen. |

The root [README.md](../README.md) remains the entry point: quick start, project
structure, architecture decisions in prose, and the living changelog.

## Reading order

**Starting the backend?**
[API-CONTRACT.md](./API-CONTRACT.md) → the seven interfaces in
`src/lib/repositories/types.ts` → the acceptance section at the end.

**Taking over the frontend?**
[TRD.md](./TRD.md) → the repository seam → [DESIGN.md](./DESIGN.md) checklist.

**Reviewing scope?**
[PRD.md](./PRD.md), especially §4 business rules and §5 out of scope.

**Shipping it?**
[TESTING.md](./TESTING.md) → `typecheck`, `lint`, `build`, `smoke`.

## Status

| | |
|---|---|
| Screens | 7 of 7 working |
| Automated checks | 154 across 7 suites, all passing |
| Static gates | `typecheck`, `lint`, `build` all exit 0 |
| Backend | not started — contract written, nothing implemented |
| Open | shift gating, cash reconciliation, real prices and costs |