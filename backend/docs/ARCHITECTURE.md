# Backend architecture

How this service is put together, and the few rules that are not obvious from
the code. For *what* the endpoints are, read the API contract — see
[`README.md`](README.md).

## Layout

```
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

## Two entrypoints, on purpose

`app.ts` builds the application. `server.ts` binds a port and opens a database
connection. Tests import `createApp` and drive it with Supertest without either.

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

### Handlers read `req.validated`, never `req.query`

Everything in `req.query` arrives as a string, so `req.query.includeInactive ===
false` is never true. The `validate()` middleware parses and coerces, and stores
the result. A Zod failure throws before the handler runs, which means handlers
contain no validation branches at all.

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
other even under concurrency. See `modules/orders/`.

### Sessions are cookies; roles are re-checked every request

The session is a signed JWT in an httpOnly cookie. The token carries **only the
user id** — `requireSession` re-reads the user from the database on each request
rather than trusting the token body, so deactivating an account takes effect
immediately instead of at token expiry. A staff member fired at closing time has
to stop working now, not in twelve hours.

Role checks happen on the route. Hiding a nav link is presentation, not
authorisation.

Three details that are easy to get wrong and are pinned in `lib/session.ts`:

- **The algorithm is pinned to HS256** rather than read from the token header.
  Without that, a token claiming `alg: none` would skip signature verification.
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

## Environment

See `.env.example`. Notable defaults, all in `config/env.ts`:

- `PORT` 3001 — Next.js dev already binds 3000.
- `COOKIE_SECURE` false for local HTTP. True behind HTTPS, or the browser drops
  the cookie and login silently stops working.
- `STORE_TIMEZONE` `Asia/Jakarta` — report day boundaries resolve here, not in
  the server's zone, or a day of sales shifts across midnight UTC.
- `TAX_RATE_DEFAULT` 0.1 — Indonesian VAT.

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