# Moka POS — remediation handoff

Last updated: 2026-10-23

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

### Verified after the latest edits (2026-10-23)

- `backend`: `npm run lint` — pass, no warnings.
- `backend`: `npm run typecheck` — pass.
- `backend`: `npm test` — 15/15 unit tests pass.
- `backend`: `npm run test:e2e` — 224/224 pass across 10 files (~208 s).
- `backend`: 239 tests total.
- `frontend`: `npm test` — 18/18 pass across 2 files.
- `frontend`: `npm run lint` — pass.
- `frontend`: `npm run typecheck` — pass.
- `frontend`: `npm run build` — pass, 10 routes generated (12 static pages).
- `frontend`: `npm run smoke` — 187/187 across 7 suites, against an isolated
  seeded MongoDB replica set and the production build.
- CI now runs the frontend unit suite before Build.

### Baseline before this pass

Backend was 210 e2e + 15 unit = 225 tests. The frontend had no unit suite. Both
are now superseded by the counts above.

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
```

## Known follow-ups / review notes

- The mock product repository writes the opening count as a `purchase` movement
  through `recordOpeningStock`, attributed to a system actor because the mock
  has no session. The HTTP path still takes the actor from the session.
- The reports code assumes integer rupiah totals. Revisit if fractional pricing
  is ever introduced.
- `NEXT_PUBLIC_STORE_TIMEZONE` must match the backend's `STORE_TIMEZONE`; it is
  public because the browser needs it to group report days.

## Environment

- Node `v24.20.0`, npm `11.19.0`.
- Backend `node_modules` and `.env` exist.
- Frontend `node_modules` and `.env.local` exist.
- Backend e2e uses `mongodb-memory-server` with a single-node replica set and
  `fileParallelism: false`.
- `rg` is not available in this Windows environment; use `Select-String` or the
  grep tool.
