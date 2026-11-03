# Documentation

These documents were written **before** the backend existed and are the contract
it was built against. The API in [`../../backend`](../../backend/README.md) is
now live, and the frontend's eight repositories resolve to it over HTTP. Where a
document says "must" or "should", read it as the rule the server actually
enforces.

| Document | Read it for |
|---|---|
| [PRD.md](./PRD.md) | **What the product does.** Users, the seven dashboard screens with acceptance criteria, the business rules, what is deliberately out of scope, and the four decisions needed before the backend. |
| [TRD.md](./TRD.md) | **How it is built.** Stack, the repository seam, the data model, the rules that live in code, routing and permissions, performance and accessibility decisions, and the plan for swapping in a server. |
| [API-CONTRACT.md](./API-CONTRACT.md) | **What the backend must provide.** Every repository method as an HTTP endpoint, request and response shapes, the error envelope, security rules the server owns, and the suggested MongoDB shape. **Implemented** — verified by `backend/test/contract.e2e.ts`. |
| [TESTING.md](./TESTING.md) | **How it is verified.** The 8 browser suites, the Vitest unit tests, what is *not* covered, and the conventions to keep. |
| [DESIGN.md](./DESIGN.md) | **How it looks and behaves.** Brand tokens, locale, touch targets, motion, focus, the print rules and their traps, and a checklist for adding a screen. |

The root [README.md](../README.md) remains the entry point: quick start, project
structure, architecture decisions in prose, and the living changelog.

## Reading order

**Starting the backend?**
It is built. See [`../../backend/README.md`](../../backend/README.md) and
[`../../backend/docs/ARCHITECTURE.md`](../../backend/docs/ARCHITECTURE.md).

**Reading the API contract?**
[API-CONTRACT.md](./API-CONTRACT.md) is the spec the server was built against and
the document `contract.e2e.ts` asserts.

**Taking over the frontend?**
[TRD.md](./TRD.md) → the repository seam → [DESIGN.md](./DESIGN.md) checklist.

**Reviewing scope?**
[PRD.md](./PRD.md), especially §4 business rules and §5 out of scope.

**Shipping it?**
[TESTING.md](./TESTING.md) → `typecheck`, `lint`, `build`, `smoke`.

## Status

| | |
|---|---|
| Screens | 7 dashboard screens + login, all working |
| Automated checks | 194 smoke checks, 30 frontend unit tests, 307 backend tests |
| Static gates | `typecheck`, `lint`, `build` all exit 0 |
| Backend | **built** — 38 routes, 9 models, contract verified |
| Open | real prices and costs, deployment |