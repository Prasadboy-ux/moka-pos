# Tests

```bash
npm test          # unit — src/**/*.spec.ts, no database needed
npm run test:e2e  # e2e  — test/**/*.e2e.ts, needs a real MongoDB
npm run test:cov
```

## The database

E2E tests run against a real MongoDB started by `mongodb-memory-server` as a
**single-node replica set** — not a mock, and not a standalone `mongod`.

The replica set is the point. `POST /api/orders` runs inside a multi-document
transaction, and a standalone server refuses those. A mock that allowed them
would let the one code path most capable of corrupting data go entirely
untested.

The first run downloads a `mongod` binary (~100 MB) into a global cache. Later
runs reuse it.

To run against Atlas instead, set `MONGODB_URI` to a **dedicated test
cluster**, not the dev one — `test/helpers/mongo.ts` wipes every collection.

## Conventions

- **Unit tests are co-located** in `src/` beside the code they cover.
- **E2E tests live in `test/`** and drive the real app through Supertest.
- The two globs are disjoint. An earlier unit glob of `**/*.spec.ts` also
  matched `*.e2e-spec.ts`, which made `npm test` silently require a database.
- `fileParallelism` is off for e2e, because every suite resets the shared
  collections and parallel files would race each other's fixtures.

## What to test where

| Behaviour | Where |
|---|---|
| Day boundaries, rounding, receipt formatting | unit — pure functions, no I/O |
| Schema constraints, indexes, case-insensitive uniqueness | e2e — needs a real index |
| Route behaviour, status codes, error envelope | e2e via Supertest |
| Sale atomicity and oversell refusal | e2e — needs real transactions |

Anything involving money, stock, or a date boundary deserves a negative test.
Those three are where a POS silently loses money: a tax rounded down, stock that
drifts a gram at a time, a report that quietly omits today.