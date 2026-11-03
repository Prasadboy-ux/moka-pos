# Moka POS — remediation handoff

_Last updated: 2026-11-03 (security hardening: session revocation, password
policy, rate limits, the production demo-account guard, and admin-reset /
reactivation revocation)._

This file is the continuation point for the audit remediation work. It records
what changed, what has been verified, and what still has to be done. It is not a
replacement for the product docs in `frontend/docs/` or the backend docs in
`backend/docs/`.

## Repository layout

- `backend/` — Express 5 + MongoDB API.
- `frontend/` — Next.js 16 app.
- `frontend/docs/API-CONTRACT.md` — API contract.
- `frontend/docs/PRD.md`, `TRD.md`, `TESTING.md`, `DESIGN.md` — product and test docs.
- `backend/docs/ARCHITECTURE.md` — backend structure and invariants.

## Current status

### Security hardening (2026-11-02)

- Sessions now carry a `sessionEpoch`; logout and password change bump it, so
  every outstanding JWT for the account stops working. An admin password reset
  and any activation-state change also bump it, so a reset cookie dies and
  reactivating an account cannot revive old sessions. The JWT also pins
  issuer/audience.
- Password policy is shared by create, update, and self-service change: minimum
  12 characters plus a common-password blocklist. The login schema still accepts
  existing short passwords so a deploy cannot lock everyone out.
- New per-username login and per-user+IP password-change limiters complement the
  existing per-IP login and API limits. `trust proxy` is off by default and
  auto-detects Vercel.
- API responses send `Cache-Control: no-store`; production rejects `CORS_ORIGIN=*`,
  a placeholder `SESSION_SECRET`, and `COOKIE_SECURE=false`.
- The login demo panel is hidden unless `NEXT_PUBLIC_DEMO_CREDENTIALS=true`.
  Production refuses to start while an active seeded demo password still works;
  the guard covers `admin`, `kasir`, and `kasir2`.

### Verified after the security hardening pass (2026-11-02)

- `backend`: `npm run lint`, `npm run typecheck`, `npm test` (19/19),
  `npm run build`, `npm run test:e2e` (292/292) — pass.
- `frontend`: `npm run typecheck`, `npm run lint`, `npm test` (30/30 across
  4 files), `npm run build` (12 static pages) — pass.
- `frontend`: `npm run smoke:ci` — starts MongoDB, seeds, boots the API and the
  production frontend, passes 194/194 across 8 suites, and tears the whole
  stack down. This is what `.github/workflows/smoke.yml` runs weekly and on
  demand.
- `npm audit --omit=dev` — 0 production vulnerabilities in both apps. The
  frontend's remaining 16 moderate advisories are dev-only eslint/minimatch
  chain issues; fixing them needs a breaking `--force` upgrade.
- The checkout dialog now keeps one idempotency key per unchanged cart and
  blocks dismissal while a POST is in flight; the key is reused after a retry
  and cleared after a completed sale.
- `middleware.ts` was renamed to `proxy.ts` (`export function proxy`) for the
  Next 16 convention, and `next.config.ts` sets a baseline set of response
  headers plus a CSP. The policy keeps `connect-src 'self'` and allows no
  third-party script/style/frame origins; the smoke suites now drive their setup
  calls through the same-origin `/api` rewrite, so they exercise that policy
  instead of bypassing it with a direct `localhost:3001` fetch.

### Verified after the third pass and audit fixes (2026-10-28) — backend

- `backend`: `npm run lint` — pass, no warnings.
- `backend`: `npm run typecheck` — pass.
- `backend`: `npm test` — 19/19 unit tests pass.
- `backend`: `npm run test:e2e` — 280/280 pass across 13 files (~287 s):
  app, auth, catalogue, contract, models, orders, rate-limit, reports, seed,
  serverless-entry, serverless-health, stock, users-shifts.
- `backend`: 299 tests total (280 e2e + 19 unit).

### Verified after the All-time follow-up (2026-10-28) — frontend

- `frontend`: `npm run typecheck` and `npm run lint` — pass.
- `frontend`: `npm test` — 23/23 across 3 files.
- `frontend`: `npm run build` — pass, 12 static pages.
- `frontend`: `npm run smoke` — 194/194 across 8 suites against a seeded
  in-memory replica set and the production build.

### Login demo access (2026-10-28)

The seeded accounts are listed under the sign-in form again as click-to-fill
buttons (`frontend/src/components/auth/demo-credentials.ts`):
`admin` / `admin123` and `kasir` / `kasir123`. The repository refactor had
dropped the panel the frontend README already promised. These credentials work
when the backend database has been seeded (`npm run seed`). Browser-checked:
both buttons render and fill the role picker, username, and password.

### Verified in the second pass (2026-10-25) — frontend

- `frontend`: `npm run typecheck` and `npm run lint` — pass.
- `frontend`: `npm test` — 20/20 across 2 files (includes the two
  timezone-adoption tests).
- `frontend`: `npm run build` — pass, 10 routes + the global error page
  (12 static pages).
- `frontend`: `npm run smoke` — 187/187 across 7 suites, against an isolated
  seeded MongoDB replica set and the production build (last full smoke run in
  the earlier pass; the unit suites above cover every file changed since).
- CI runs the frontend unit suite before Build.

### Baseline before the passes

Backend was 210 e2e + 15 unit = 225 tests. The frontend had no unit suite. Both
are superseded by the counts above.

## Third remediation pass (2026-10-27)

Backend-only hardening on top of the second pass. No contract routes changed;
the frontend source was not touched.

| Area | Change |
|---|---|
| Health probe | Extracted to `src/lib/health.ts`. Registered before the body parser and limiter in `createApp`, and before the connect hook in the serverless wrapper, so a database outage answers `503 degraded` instead of a 500 or a hung probe. The serverless probe bounds its cold-start wait. |
| Cookie policy | Production now refuses to boot with `COOKIE_SECURE=false`; env validation fails with a pointed message. `.env.example` documents the requirement. |
| Log hygiene | Request logging keeps the path and drops the query string, which can carry a customer name or phone from order/report search. |
| Quantities | Order line `qty` must be a whole number in `[1, 10_000]`; a cart is capped at 100 lines. Recipe quantities remain fractional (grams and millilitres). Direct-product `stock`/`minStock` must be whole pieces. |
| Idempotency | Keys record the minting shift. A replay from another shift answers `409 idempotency-key-foreign`; legacy keys fall back to the shift stamped on the order. Coverage reads join the sale transaction. |
| Product modes | Switching a product back to `direct` initialises `stock` to `0` instead of leaving it undefined, so the response always carries the numeric fields `direct` promises. `levelOf` reports `0` rather than `null` for a direct product with no count. |
| Report bounds | `GET /api/reports/sales` rejects ranges longer than 366 days (`422`, `fields.to`). The aggregate loads every matching order in Node, so the cap is a memory/CPU guard. |
| Users | `PUT /api/users/:id` requires an explicit `isActive`; an empty-string password means "leave the existing one alone". |
| Regression coverage | 10 new e2e cases: serverless health degraded paths, fractional order quantity, closed-shift idempotency replay, health bypassing the limiter, the report range cap, fractional product stock, required `isActive`, empty password. |

**Cross-cutting follow-up (resolved 2026-10-28):** the frontend Transactions
screen's "All time" preset asked the sales report from `2000-01-01`, which the
new 366-day cap rejected. The preset is now **Last 12 months**
(`monthStartMonthsAgo(11)`), the same shape as the reports screen; twelve
calendar months fit inside the cap, including a leap day. The ledger and the
tiles share the window, and `smoke:screens` opens `?range=12m`.

## Second remediation pass (2026-10-25)

### Backend

| Area | Change |
|---|---|
| Report filters | `GET /api/reports/sales` accepts `method` and `q`, applied by the service with the same needle rules as the order list (receipt no., customer name, phone only when the needle carries digits). Tile KPIs grew a `withCustomer` count; the cashier rows still omit it. |
| Movement paging | `GET /api/stock/movements` answers `{ data, total, limit, offset }` — newest first, `limit` default 200 / max 1000, `offset` ≤ 10 000. |
| List pickers public bounds | Pickers stay unpaged but take server caps so no list can ship unbounded history: users 1000, shifts 1000, products 2000, ingredients 2000, categories 500. |
| Adjustment atomicity | `adjustStock`'s level move is now a conditional `$inc` (`stock >= -qty` for removals) instead of read-then-save, so it composes with concurrent sale decrements instead of clobbering them. Qty must be a whole number. |
| Product edit transaction | `updateProduct` writes mode switches (which set/unset `stock`) inside a transaction, closing the race with a concurrent sale's `$inc`. `setProductActive` stays a plain single-field write. |
| Rate-limit tests | `rate-limit.e2e` now dynamically imports `createApp` after pinning env, so the limiters are built with the test's configuration. 5/5. |
| Contract | `rate_limited` is in the documented error-code set; the 429 protocol is asserted in `rate-limit.e2e`. |

### Frontend

| Area | Change |
|---|---|
| Dashboard aggregates | `getAdminDashboard` asks the server for two aggregates (last 7 days, today) and `orders.recent(8)` — no order-history scan. Config is fetched first so the day keys are computed in the bucketing zone. |
| Transactions screen | The ledger and its tiles share one filtered question: both `orders.list` and `reports.sales` take the same `method`/`q`. The longest preset is **Last 12 months** (`monthStartMonthsAgo(11)`), which fits inside the report's 366-day cap. The ledger is server-paged 12 rows at a time and the voided badge counts the whole filtered window. |
| Stock screen | Movement type filter is server-side (`?type=`), refetching per switch; the default page is 200 with an explicit "newest N of M" notice when truncated. |
| Product form | In edit mode the stock level is read-only and `stockMode` is locked — counts belong to the Stock screen and the ledger records them there. Create still accepts both. |
| Timezone | Day keys are computed in `config.storeTimezone` from `GET /api/config` (adopted in the config repositories, IANA-shaped validation, build-time `NEXT_PUBLIC_STORE_TIMEZONE` stays the fallback). The env var no longer has to match the backend exactly; `rangeFor`/preset windows are computed after adoption in the dashboard, transactions, and reports loaders. |
| Checkout stale menu | When the till refuses a payment as short and menu prices changed while the cart was open, the dialog names the cause and the remedy instead of blaming the cash count. |
| Startup failure | New `src/app/global-error.tsx` renders a document-complete fallback when the root layout itself fails. |
| Dead code | Removed unused `paymentBreakdown()` and `trend()` helpers from `report-math.ts` (`paymentRowsToBreakdown`/`bucketTrend` remain in use). |


## What changed in this remediation pass

### Backend

| Area | Change |
|---|---|
| Product opening stock | `createProduct` now runs in a transaction and calls `recordOpeningStock`, which writes the opening direct-product count as a `purchase` stock movement. `recordOpeningStock` lives in the stock service, keeping stock writes in one module. |
| Product edit | `updateProduct` never writes `stock`. Switching away from `direct` unsets both `stock` and `minStock`, so switching back starts from 0 rather than resurrecting a stale count; direct updates may change `minStock` but not the level. |
| Product JSON | Direct products always expose `stock`/`minStock` (defaulting to 0). Recipe products omit both fields and expose `recipe`. |
| Stock adjustment | Server now rejects zero quantities and sign/reason mismatches: `purchase` must be positive, `waste` must be negative, `adjustment` may go either way. |
| Inactive products | `POST /api/orders` re-reads `isActive` and refuses a hidden product with a 422 validation error instead of selling it by stale id. |
| Underpayment | Explicit 422 validation when `paidAmount < total`, rather than relying on the order model's `changeAmount` minimum. |
| Shift close vs sale | A sale updates the open shift's `__v` inside its transaction (`findOneAndUpdate`). A concurrent close must serialise behind that write rather than reading stale sales. |
| Duplicate open shifts | Partial unique index on `{ userId }` where `status: 'open'`; duplicate-key errors map to `409 already-open-shift`. |
| Last active admin | Demotion/deactivation now runs in `withTransaction`, takes a serialised guard write on `counters/user-admin-guard`, then counts other active admins. Two admins cannot both demote each other past the guard. |
| Auth failure reasons | Error envelope now includes `invalid`, `inactive`, or `role-mismatch` as `reason`; login uses 401 for the first two and 403 for role mismatch, before any cookie is set. |
| Store config | New public `GET /api/config` returns `{ taxRate, storeTimezone }`. |
| Shared mongo error helper | `backend/src/lib/mongo-errors.ts` holds `isDuplicateKey`, used by orders and shifts. |
| Regression coverage | New assertions cover opening stock, mode switching, stock signs, inactive/underpayment refusal, auth reasons, sale-vs-close, last-admin, and duplicate-username races, plus the `/api/config` contract route. |
| Vercel entry | Added `backend/api/[...path].ts` re-exporting `api/index.ts` and deleted the path-dropping `vercel.json` rewrite. |

### Frontend

| Area | Change |
|---|---|
| Tax rate | `GET /api/config` is exposed through a new `config` repository. The POS loads the server's tax rate into the cart, so the displayed total matches what the server charges. |
| Auth role | `authenticate(username, password, role)` sends the selected role. The login form no longer performs a second post-login role check; the server refuses the mismatch before setting a cookie. |
| Idempotency | New `lib/idempotency.ts`; `CheckoutDialog` creates one key per opened checkout and reuses it across retries. `CreateOrderInput` carries it, and the HTTP repository sends it as `Idempotency-Key` instead of minting a new key per request. |
| Stock adjustment UI | A correction now keeps the signed number the admin typed and shows one projected level. Purchases and waste still derive their sign from the reason. The old UI showed both directions and always sent the positive one. |
| Product edit UI | The mock repository also preserves the existing stock level on update. |
| Reports revenue | `allocateGrossRevenue` splits each order's gross `total` (PPN included) across lines using proportional shares and largest-remainder rounding. Category and product revenue now add up to KPI revenue. |
| Report timezone | Day/month bucketing uses `NEXT_PUBLIC_STORE_TIMEZONE` (default `Asia/Jakarta`) through `Intl`; date-only arithmetic is done in UTC so a browser in another zone cannot shift the calendar. |
| Dashboard load | The dashboard fetches the last 7 calendar days plus `orders.recent(8)`, instead of loading all order history. |
| 12-month preset | Uses `monthStartMonthsAgo(11)` on store-calendar keys. |
| Unit tests | Added Vitest (`vitest.config.mts`) with 18 tests for read models and cart totals; `npm test` script and CI step added. |
| Dates | `Intl.DateTimeFormat` instances are cached per timezone to remove the cold-start timeout flake. |
| Docs | API contract now documents config, eight repositories, product JSON, stock signs, revenue allocation, timezone, and idempotency lifecycle. Test and smoke counts were refreshed. |

## Files changed in this pass

Backend:

- `src/lib/errors.ts`
- `src/lib/dates.ts`, `src/lib/dates.spec.ts`
- `src/lib/mongo-errors.ts` (new)
- `src/models/product.model.ts`
- `src/models/shift.model.ts`
- `src/models/user.model.ts`
- `src/modules/auth/auth.service.ts`
- `src/modules/orders/orders.service.ts`
- `src/modules/products/products.routes.ts`
- `src/modules/products/products.service.ts`
- `src/modules/shifts/shifts.service.ts`
- `src/modules/stock/stock.schemas.ts`
- `src/modules/stock/stock.service.ts`
- `src/modules/users/users.service.ts`
- `src/routes/index.ts`
- `test/catalogue.e2e.ts`, `test/models.e2e.ts`, `test/auth.e2e.ts`
- `test/stock.e2e.ts`, `test/orders.e2e.ts`, `test/users-shifts.e2e.ts`
- `test/contract.e2e.ts`, `test/serverless-entry.e2e.ts`
- `api/[...path].ts` (new); `vercel.json` deleted

Frontend:

- `src/lib/idempotency.ts` (new)
- `src/lib/repositories/mock/config.ts` (new)
- `src/lib/repositories/http/catalog.ts`
- `src/lib/repositories/http/commerce.ts`
- `src/lib/repositories/index.ts`
- `src/lib/repositories/mock/products.ts`
- `src/lib/repositories/mock/users.ts`
- `src/lib/repositories/read-models.ts`
- `src/lib/repositories/read-models.spec.ts` (new)
- `src/lib/repositories/types.ts`
- `src/store/useCartStore.ts`
- `src/store/useCartStore.spec.ts` (new)
- `src/components/auth/LoginForm.tsx`
- `src/components/pos/PosScreen.tsx`
- `src/components/pos/CheckoutDialog.tsx`
- `src/components/reports/ReportsScreen.tsx`
- `src/components/stock/StockAdjustDialog.tsx`
- `vitest.config.mts` (new), `package.json`, `package-lock.json`
- `.env.local.example` (added `NEXT_PUBLIC_STORE_TIMEZONE`)
- `docs/API-CONTRACT.md`, `docs/PRD.md`, `docs/TRD.md`, `docs/TESTING.md`, `docs/README.md`, `README.md`

Repo:

- `.github/workflows/ci.yml`

## Worktree warning

The working tree was already dirty before this pass. The large set of modified
frontend UI/docs files (design-system, layouts, README, docs, etc.) is
**pre-existing work**, not part of this remediation. Do not assume every
modified file belongs to the changes above.

`backend/api/` and `backend/test/serverless-entry.e2e.ts` are now part of this
remediation. Still untracked and not created by this pass:

- `backend/scripts/cleanup-leftover-users.mjs`

## Remaining work, in order

1. **Re-run CI once a monorepo remote exists.** All local commands are green,
   and the workflow now includes `npm test` for the frontend before Build. The
   frontend tree was synced to `fe-moka-pos` (`7418246`), but the old
   `moka-pos` origin still returns "Repository not found", so the monorepo
   workflow has never run.
2. **Verify Vercel routing if that deployment is used.** Local tests prove the
   catch-all entry identity; they do not exercise Vercel's rewrite machinery.
   Production deploys must also set `COOKIE_SECURE=true` or the API will refuse
   to boot.
3. **Optional follow-ups.** See the review notes below; none blocks release.

## Useful commands

Backend:

```powershell
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

Frontend:

```powershell
npm test
npm run lint
npm run typecheck
npm run build

# Build both projects first, then run the whole stack and the browser suites.
npm run smoke:ci
```

## Known follow-ups / review notes

- The mock product repository writes the opening count as a `purchase` movement
  through `recordOpeningStock`, attributed to a system actor because the mock
  has no session. The HTTP path still takes the actor from the session.
- The reports code assumes integer rupiah totals. Revisit if fractional pricing
  is ever introduced.
- `NEXT_PUBLIC_STORE_TIMEZONE` is now an advisory fallback: the frontend adopts
  the zone the API advertises on `GET /api/config` for day-key math, so a
  rebuild is no longer required when the backend's `STORE_TIMEZONE` changes.
  Set it anyway so the pre-config window (one request) computes in the right
  zone too.
- `frontend/asset/` is intentionally kept: it is the labelled source artwork the
  served `public/menu/` copies are stripped from (see `frontend/README.md`).
- The demo-account panel on the login screen is hidden unless
  `NEXT_PUBLIC_DEMO_CREDENTIALS=true` is set at build time, so a production
  build fails closed. `smoke:screens` accepts either state, and the backend
  refuses to start in production if the seeded passwords still work.
- `.github/workflows/smoke.yml` is manual plus weekly, not per-pull-request:
  the full stack takes several minutes. The fast gates stay in `ci.yml`.
- The `backend` e2e and the smoke runner share
  `~/.cache/mongodb-binaries`; a cold cache downloads mongod first, which is
  why the smoke script allows ten minutes before giving up on the URI.

## Environment

- Node `v24.20.0`, npm `11.19.0`.
- Backend `node_modules` and `.env` exist.
- Frontend `node_modules` and `.env.local` exist.
- Backend e2e uses `mongodb-memory-server` with a single-node replica set and
  `fileParallelism: false`.
- `rg` is not available in this Windows environment; use `Select-String` or the
  grep tool.
