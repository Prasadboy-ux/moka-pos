# Moka-POS backend

Express + MongoDB API for Moka-POS, a point-of-sale system for Indonesian coffee
shops. Serves the Next.js frontend in [`../frontend`](../frontend).

## Status

**Complete and live.** 41 contract endpoints plus `/api/health`, 9 Mongoose
models, and 342 tests (41 unit, 301 end-to-end across 15 files). The frontend in
[`../frontend`](../frontend) resolves its eight repositories to this API over an
httpOnly cookie session.

The API is specified in
[`../frontend/docs/API-CONTRACT.md`](../frontend/docs/API-CONTRACT.md), which
this was built against. `test/contract.e2e.ts` asserts all 41 routes against that
document **transcribed by hand**, so the test verifies the contract rather than
restating the code.

Production hardening in place: mandatory admin TOTP enrolment with single-use
recovery codes (atomic one-time consumption), admin MFA reset, login,
per-username login, password-change and API rate limits (env-tunable, disabled
under `NODE_ENV=test`); server-side
session revocation on logout and password change via a JWT epoch claim; a
12-character password floor with a common-password blocklist; `Cache-Control:
no-store` on every API response; and a startup guard that refuses to boot while
a seeded demo password still works. `trust proxy` is off by default and
auto-detects Vercel. `/api/health` answers outside the limiter and the
serverless connect hook, so a database outage reports `503 degraded` instead of
a timeout or a 500. Production refuses to boot with `COOKIE_SECURE=false` or a
placeholder `SESSION_SECRET`; order quantities, cart size, product stock counts,
shift-scoped idempotency keys and report ranges are all bounded.

See [`docs/README.md`](docs/README.md) for the documentation map and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the code is arranged.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 24.7+, TypeScript strict, ESM |
| HTTP | Express 5 (async handlers, no wrapper needed) |
| Database | MongoDB, Mongoose |
| Validation | Zod — the same library the frontend uses, so rules stay mirrored |
| Sessions | httpOnly cookie, JWT via `jose` |
| Passwords | Argon2id via `node:crypto`, with scrypt verification and migration |
| Tests | Vitest + Supertest |
| Lint / format | oxlint, Prettier |

## Setup

Requires Node 24+ and a MongoDB cluster with transaction support
(MongoDB Atlas free tier, or `mongodb-memory-server` as a replica set).

For local development, `npm run mongo` starts a throwaway replica set on a fixed
port (`27019`, override with `MONGO_PORT`) and keeps `MONGODB_URI` in `.env`
pointed at it. The script rewrites `.env` on every start, so a busy port or a
previous run cannot leave the API dialling a dead one. Leave it running and use a
second terminal for the API.

The database is in memory: restarting it starts empty, so run `npm run seed`
again to restore the demo catalogue and accounts.

```bash
npm install
cp .env.example .env    # production values only; local dev can keep the defaults
npm run mongo           # terminal 1 — local MongoDB, leave running
npm run seed            # terminal 2 — demo data (rerun after each database restart)
npm run dev             # terminal 2 — http://localhost:3001
```

Check it is alive:

```bash
curl http://localhost:3001/api/health
```

The frontend dev server runs on 3000; the API is on 3001 so they can run side by
side.

### Secrets

`backend/.env*` is ignored except `.env.example`, including manual backups.
Never commit a backup of a live environment. If a secret reaches git, rotate it
first; deleting the file does not remove it from history.

## Scripts

| Script | Purpose |
|---|---|
| `npm run mongo` | Local MongoDB replica set, syncs `MONGODB_URI` into `.env` |
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
| `npm run mfa:reset -- <username>` | Emergency: clear an account's MFA and revoke its sessions |

### When the only admin loses their authenticator and recovery codes

The reset goes straight to MongoDB, so it works without a running API:

```bash
cd backend
npm run mfa:reset -- admin --dry-run   # preview: which account, how many codes
npm run mfa:reset -- admin             # perform the reset
```

That clears `mfaSecret` and every stored recovery-code hash, then bumps the
session epoch so any existing cookie stops working. The password is untouched.
The next sign-in enrols a fresh authenticator and issues eight new codes. The
script prints a redacted `MONGODB_URI` first, so an operator can check they are
pointing at the right database before anything is written.

The same action is available in the UI when a *second* admin is available:
**Users → ⋯ → Reset two-factor**.

## Documentation

Start at [`docs/README.md`](docs/README.md).