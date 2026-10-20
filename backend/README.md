# Moka-POS backend

Express + MongoDB API for Moka-POS, a point-of-sale system for Indonesian coffee
shops. Serves the Next.js frontend in [`../frontend`](../frontend).

## Status

**Complete and live.** 34 contract endpoints plus `/api/health`, 9 Mongoose
models, and 219 tests. The frontend in [`../frontend`](../frontend) resolves its
seven repositories to this API over an httpOnly cookie session.

The API is specified in
[`../frontend/docs/API-CONTRACT.md`](../frontend/docs/API-CONTRACT.md), which
this was built against. `test/contract.e2e.ts` asserts all 35 routes against that
document **transcribed by hand**, so the test verifies the contract rather than
restating the code.

Production hardening in place: login and API rate limits (env-tunable, disabled
under `NODE_ENV=test`), pino structured logging, response compression, and
concurrency tests proving two tills cannot oversell the last unit of stock.

See [`docs/README.md`](docs/README.md) for the documentation map and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the code is arranged.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 24, TypeScript strict, ESM |
| HTTP | Express 5 (async handlers, no wrapper needed) |
| Database | MongoDB, Mongoose |
| Validation | Zod — the same library the frontend uses, so rules stay mirrored |
| Sessions | httpOnly cookie, JWT via `jose` |
| Passwords | `node:crypto` scrypt — no native build step |
| Tests | Vitest + Supertest |
| Lint / format | oxlint, Prettier |

## Setup

Requires Node 24+ and a MongoDB cluster with transaction support
(MongoDB Atlas free tier, or `mongodb-memory-server` as a replica set).

```bash
npm install
cp .env.example .env    # then fill in MONGODB_URI and SESSION_SECRET
npm run seed            # optional: demo catalogue and 30 days of sales
npm run dev             # http://localhost:3001
```

Check it is alive:

```bash
curl http://localhost:3001/api/health
```

The frontend dev server runs on 3000; the API is on 3001 so they can run side by
side.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Watch mode via `tsx` |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | oxlint, type-aware |
| `npm run format` | Prettier, write |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run test:cov` | Coverage |
| `npm run seed` | Reset to demo data |

## Documentation

Start at [`docs/README.md`](docs/README.md).