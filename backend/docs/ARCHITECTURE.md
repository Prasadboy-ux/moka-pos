# Backend architecture

How this service is put together, and the few rules that are not obvious from
the code. For *what* the endpoints are, read the API contract — see
[`README.md`](README.md).

## Layout

```
index.ts           Vercel entry: the same app, lazily connected, no listen
src/
  server.ts        process entry: env -> database -> port -> graceful shutdown
  app.ts           Express app factory (middleware + routes)
  config/env.ts    zod-validated process.env, parsed lazily
  db/              connection lifecycle and transaction helpers
  lib/             cross-cutting: errors, validation, money, dates, hashing
  middleware/      session guards
  models/          one Mongoose model per collection
  modules/         one folder per contract section (auth, orders, stock, ...)
  routes/index.ts  mounts every module onto /api
  seed.ts          demo data
test/              e2e tests (*.e2e.ts) and global setup
```

## Entrypoints, on purpose

`src/app.ts` builds the application. `src/server.ts` binds a port and opens a
database connection. Tests import `createApp` and drive it with Supertest
without either.

`index.ts` at the project root is the Vercel serverless entry: same `createApp`,
no `listen`, and the database connects lazily on the first request per cold start
(the resolved promise is cached in module scope so warm invocations skip it).

Its name and location are part of the deployment contract, not tidiness. Vercel's
Express preset picks the first file named `app`, `index` or `server` (root or
under `src/`) whose **source text** imports `express`, then ships that default
export as a single function that receives every request path. So `index.ts` must
keep its own `express` import and must not become a re-export — the detector
reads the file, not its import graph, and a re-export makes it fall through to
`src/app.ts`, which is a factory rather than an app.

One function rather than one function per route is also why nested paths work. A
plain `api/` directory maps one fixed route per file and has no catch-all, so
`/api/health` reached Express while `/api/auth/login` was answered by the platform
with a bare 404. The frontend proxies `/api/*` to this service through a Next.js
rewrite so the session cookie stays same-origin — see the frontend's
`next.config.ts`.

`/api/health` is mounted separately from the API router in both entries. In
`createApp` it sits before the body parser and the rate limiter; in the
serverless wrapper it sits before the connect hook and bounds the wait for a
cold connection. A probe must answer `503 degraded` while Mongo or the limiter
store is unavailable — otherwise an outage looks like a 500 or a hanging probe.

Module folders export `router`; `routes/index.ts` is the only file that knows
the full URL surface. Adding a module means adding one folder and one line.

## The rules

### Errors are constructed, never spelled out

Handlers `throw new ApiError...`. They do not call `res.status(...).json(...)` with
an error body. `lib/errors.middleware.ts` is the single place that turns a
thrown value — `ApiError`, `ZodError`, Mongoose validation, duplicate key,
malformed JSON — into the envelope.

Express 5 forwards rejected promises from async handlers to that middleware, so
route handlers contain no `try/catch` and no `asyncHandler` wrapper. A `throw` is
enough.

### Handlers read parsed input, never `req.query`

Everything in `req.query` arrives as a string, so `req.query.includeInactive ===
false` is never true. `validate()` parses and coerces, and handlers read the
result through `parsed()` / `routeId()`. A Zod failure throws before the handler
runs, which means handlers contain no validation branches at all.

The trap worth naming: **`z.coerce.boolean()` does not fix this, it makes it
worse.** It applies JavaScript's `Boolean(value)`, so `?includeInactive=false`
becomes `true` and every inactive product appears on the POS grid. Only the
affirmative spellings count — see `queryBoolean` in `lib/schemas.ts`.

### Literal paths are declared before parameterised ones

`PUT /categories/order` and `PUT /categories/:id` are different verbs on
different shapes, and Express matches in declaration order. Registering `:id`
first would capture `"order"` as an id and answer 422 about an id the caller
never sent. Same for `PATCH /products/:id/active` against `/products/:id`.

### A search term is escaped, not trusted

`?search=` becomes a Mongo `$regex`, so `escapeRegExp` strips the
metacharacters. Without it a search for `.*` matches every product and
`(a+)+b` is a denial-of-service vector.

### Money is integer rupiah

`z.number().int()` on every money field. No floats anywhere — `12_000.00` and
`12000.5` are both rejected. Totals are computed server-side from stored prices;
a `subtotal` or `total` in a request body is ignored, not trusted.

### Denormalised fields are historical, not derived

Order lines store `name`, `price` and `stockMode` as they were at the time of
sale. Stock movements store `label` and `byUserName`. Renaming a product must
never rewrite what a receipt says, so nothing in this service joins back to
recompute these on read.

### Current stock lives on the document; the ledger is history

`ingredients.stock` and direct-mode `products.stock` are current levels. There
is no inventory collection. `stock_movements` is an audit trail of how the level
got there — it is never read to answer "how much do I have?", because that would
mean summing a growing table on every keystroke.

### `POST /api/orders` is one transaction

The sale is the only place where several collections must move together. It runs
inside a single MongoDB transaction, and stock decrements are *conditional*
(`$inc` filtered on `stock: { $gte: qty }`) so two tills cannot oversell each
other even under concurrency. Coverage reads also run inside that transaction,
so the stock they check is the stock the sale writes. See `modules/orders/`.

Idempotency keys are owned by the shift that minted them. A retry after the
shift closed but before a new one opened still replays; once a different shift
is open, the key answers `409 idempotency-key-foreign` rather than putting
yesterday's receipt on today's drawer.

### Sessions are cookies; roles are re-checked every request

The session is a signed JWT in an httpOnly cookie. The token carries the user id
and a `sessionEpoch` — `requireSession` re-reads the user from the database on
each request rather than trusting the token body, so deactivating an account
takes effect immediately instead of at token expiry. A staff member fired at
closing time has to stop working now, not in twelve hours.

The epoch is what makes logout and password changes real: the service increments
the user's `sessionEpoch`, and every token minted with the old value fails the
comparison. An admin password reset and any activation-state change bump it too,
so a reset cookie dies and reactivating an account cannot revive an old session.
A stateless JWT cannot be deleted, so this is the revocation mechanism. Logout
is best-effort and never blocks clearing the cookie.

Role checks happen on the route. Hiding a nav link is presentation, not
authorisation.

Five details that are easy to get wrong and are pinned in `lib/session.ts`:

- **The algorithm is pinned to HS256** rather than read from the token header.
  Without that, a token claiming `alg: none` would skip signature verification.
- **The issuer and audience are pinned** so a token minted for another service
  cannot be replayed here.
- **The token purpose is pinned.** MFA challenge and setup tokens are signed with
  the same key but carry `purpose: "mfa_challenge"` or `"mfa_setup"`;
  `verifySession` requires `"session"`, so an intermediate token can never be
  pasted into `moka_session` to skip the second factor.
- **Every jose failure becomes a 401**, never a 500. A malformed cookie is a
  routine client state, and letting the error escape also tells an attacker
  whether their forged token was structurally valid.
- **`sameSite: 'lax'`, not `'none'`.** `none` requires `secure`, which requires
  HTTPS, which breaks local development in a way that looks like login silently
  doing nothing. The frontend and API are always same-*site* (different ports, or
  `app.`/`api.` under one domain), so `lax` is sufficient. Deploying them on
  genuinely different sites changes this.

Login keeps the contract's three refusals distinct, and verifies the password
*before* reporting that an account is deactivated — otherwise the endpoint
becomes an oracle for which usernames exist. A missing user also pays the hash
cost, so a wrong username and a wrong password take the same time to reject.

MFA adds two stateless intermediate steps. An account with MFA enabled receives
a 5-minute challenge token instead of a cookie; a successful TOTP or unused
backup code mints the real session. An admin without MFA receives a 10-minute
setup token, a secret and an `otpauth://` URI; confirming the first TOTP code
stores the secret with AES-256-GCM, hashes eight backup codes, enables MFA and
bumps `sessionEpoch`. Admin enforcement is `MFA_ENFORCE_ADMIN` — on by default
outside `NODE_ENV=test`, and impossible to disable in production; the smoke
runner sets it to `false` so its seeded demo admins stay usable.

## Environment

See `.env.example`. Notable defaults, all in `config/env.ts`:

- `PORT` 3001 — Next.js dev already binds 3000.
- `COOKIE_SECURE` false for local HTTP. Production requires `true`: env
  validation refuses to start otherwise, because a session cookie must not
  travel over plain HTTP. Behind HTTPS, leaving it false also makes the browser
  drop the cookie and login silently stop working.
- `TRUST_PROXY` unset means no proxy: `X-Forwarded-For` is ignored so a direct
  client cannot choose its own IP. Vercel is auto-detected as one hop; set this
  explicitly behind nginx or another known proxy.
- `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_LOGIN_USERNAME_MAX`,
  `RATE_LIMIT_PASSWORD_MAX`, `RATE_LIMIT_API_MAX` — per-IP login, per-username
  failed login, per-user+IP password change, and whole-API limits. Disabled only
  under `NODE_ENV=test`.
- `MFA_ENFORCE_ADMIN` — require TOTP enrolment for admins. Defaults to `true`
  outside `NODE_ENV=test`; production cannot disable it. The smoke runner sets
  it to `false` for its seeded demo admins.
- `STORE_TIMEZONE` `Asia/Jakarta` — report day boundaries resolve here, not in
  the server's zone, or a day of sales shifts across midnight UTC.
- `TAX_RATE_DEFAULT` 0.1 — Indonesian VAT.

Production also refuses to start if `admin`/`kasir`/`kasir2` still use their
seeded passwords while active, if `SESSION_SECRET` is a placeholder, or if
`CORS_ORIGIN` is `*`.

## Testing

- `npm test` — unit tests, co-located at `src/**/*.spec.ts`.
- `npm run test:e2e` — `test/**/*.e2e.ts`, drives the real app via Supertest.

The two globs are disjoint by construction. Earlier the unit glob was
`**/*.spec.ts`, which also matched `*.e2e-spec.ts`, so `npm test` quietly
required a live database.

Tests that touch a database need a deployment supporting multi-document
transactions: Atlas, or `mongodb-memory-server` started as a single-node replica
set. `test/setup.ts` supplies safe fake credentials so importing the app never
depends on a `.env` that might not exist.

## Serverless / production tuning

- Mongo connection options are env-tunable (`MONGODB_SERVER_SELECTION_TIMEOUT_MS`,
  `MONGODB_MAX_POOL_SIZE`, `MONGODB_MIN_POOL_SIZE`, `MONGODB_MAX_IDLE_TIME_MS`).
  For Vercel + Atlas, keep the pool small (e.g. max 5–10, min 0) to limit
  connections across instances.
- `MONGODB_AUTO_INDEX` defaults to true outside production. In production set it
  `false` and manage indexes explicitly to avoid cold-start index builds.
- MFA verification limits are configurable via `RATE_LIMIT_MFA_MAX` and
  `RATE_LIMIT_MFA_WINDOW_MINUTES` (defaults 5 / 15 minutes).
- Request logs include a request ID (`req.id`); the app honors an incoming
  `X-Request-Id` and returns `X-Request-Id` on responses for tracing.
- In serverless (`backend/index.ts`), `createApp` owns route 404/error handling;
  the outer wrapper only gates DB connection for non-health requests.