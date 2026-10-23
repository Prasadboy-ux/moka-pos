# Testing & verification

187 automated checks across 7 Playwright suites, run against the **production
build** — not the dev server — and a **live, seeded API**, plus 18 Vitest unit
tests that need no server. All pass, with no console errors in any suite.

## Running

The suites drive the real UI, which means the real API. Three processes:

```bash
# terminal 1 — API, must be up AND seeded
cd ../backend && npm run seed && npm run dev

# terminal 2 — frontend
npm run build
npm run start

# terminal 3 — all suites, sequential
npm run smoke
```

The suites expect the API at `http://localhost:3001` (hardcoded in five of the
seven) and the frontend at `http://localhost:3000`. An unseeded database will
fail several count-based assertions in a way that looks like an app bug.

Individual suites:

```bash
npm run smoke:products
npm run smoke:stock
npm run smoke:reports
npm run smoke:users
npm run smoke:journey
npm run smoke:a11y
npm run smoke:screens
```

Unit tests and static gates run with no server:

```bash
npm test             # vitest run, 18 tests
npm run typecheck    # tsc --noEmit, strict + noUncheckedIndexedAccess
npm run lint         # eslint .
npm run build
```

Playwright browsers are not version-pinned. A fresh clone needs
`npx playwright install chromium`.

## Suites

Sequential by design: each signs in, changes data, and signs in again, so
running them concurrently would have them fighting over one session.

### `smoke:screens` — 46 checks

The acceptance pass. One question per requested screen: **is this a working
screen, or a placeholder that merely compiles?**

It asserts on the control a user would actually need — a create button, a
filter, a ledger tab — not on a heading, which a placeholder also has. Login is
only counted as working if a wrong password is *refused* before a right one gets
in.

It also carries **9 checks for the Transactions screen** (sale listing, range
presets, payment filtering, receipt-number search, and the reprint dialog), added
when that screen landed. They live here rather than in their own suite because the
acceptance pass was the natural home.

### `smoke:products` — 27

Catalogue CRUD, search and category filtering, sorting, create-time validation,
edit dialog population, appearance on the POS, delete with confirmation, absence
from the Hidden filter afterwards (a delete is terminal, unlike a hide), absence
from the POS, and the cashier route guard.

### `smoke:stock` — 18

Adjusting stock, refusal of over-withdrawal, the movement ledger and its
signed entries, ledger type filtering, the counted-products tab excluding
recipe items, **a completed sale decrementing stock and writing the ledger**,
and the route guard.

### `smoke:reports` — 25

Range and presets, period-over-period deltas, an empty period reporting zero,
**a long range switching the trend chart to monthly buckets covering all twelve
periods with month labels**, a short range returning to daily buckets, CSV
download with its filename and contents, and the route guard.

### `smoke:users` — 18

Create, password length rejection, case-insensitive duplicate username, a newly
created cashier signing in and still being refused admin routes, deactivation
blocking sign-in, and the last-active-admin guard.

### `smoke:journey` — 31

One sale followed all the way round: till → receipt → cart cleared → dashboard
reflects it numerically → movement ledger → today's report. It also covers the
**oversell clamp** — the stepper cannot be pushed past the shelf — which asks the
API for a counted product rather than pinning a product name, so it survives the
menu being reworked. (It used to read `localStorage["moka-pos.db"]` directly, which
was the abstraction leaking into the test.) This covers the *joins* between
screens, which is where a data-layer swap breaks things.

It opens with the **shift gate**: a till with no open shift refuses to sell and
offers the one action available, opening one unblocks the grid, closing shows the
server-computed reconciliation, and a closed till returns to the gate. The
counted-product and customer-details checks ride along in the same signed-in
session rather than needing their own.

List assertions here are made against the **total a screen reports**, not the
rows on the current page. The tables paginate, so a filtered set larger than one
page leaves the first page completely full, and a row count would then prove
nothing about whether the filter works.

### `smoke:a11y` — 22

`lang`, theme colour, the skip link as first tab stop, the `#main` landmark,
computed styles under `prefers-reduced-motion`, URL state surviving reloads for
filters/tab/report range, the clear-order confirmation (cancel keeps the order,
confirm empties it), the receipt as print target, and **measured print
geometry** — the dialog's centring cancelled, the receipt inside the page, and
nothing outside it still painting.

## Unit tests

`npm test` runs Vitest in a Node environment with the `@/` alias. The suite is
deliberately pure-function only: it mocks `getRepositories()` rather than
starting a server or a database, so it runs in under a second.

- `src/lib/repositories/read-models.spec.ts` — store-calendar keys and buckets,
  dashboard 7-day range, gross-revenue allocation (including leftover rupiah),
  category/product totals equal to KPI revenue, uncategorised sales, and empty
  ranges for day and month trends.
- `src/store/useCartStore.spec.ts` — subtotal/tax/total, shared-ingredient cart
  limits, and store-level caps.

## What is not covered

Honest gaps, not oversights.

- **Unit tests do not render components.** Every screen is covered through the
  browser instead, which is slower but closer to real use. Components, hooks other
  than the cart store, and the receipt/CSV builders still rely on smoke coverage.
- **No visual regression.** Screenshots were inspected by hand during
  development; nothing compares them automatically.
- **No CI for the smoke suites.** GitHub Actions runs the backend suite and the
  frontend `test`/`typecheck`/`lint`/`build` on every push
  (`.github/workflows/ci.yml`), but the browser suites need a seeded API plus a
  running frontend on fixed ports — a three-process local stack, not yet
  scripted as one.
- **One browser.** Chromium only.
- **No load or performance testing.** The API returns a whole date range at once,
  so paging behaviour under real volume is untested by definition.
- **No oversell case in the browser.** Two tills racing for the last unit is
  covered by `backend/test/orders.e2e.ts` (concurrent transactions against a
  replica set) — a case the mock could never produce and the browser could not
  reproduce reliably. The POS-side half, the stepper clamp, is in `smoke:journey`.

## Conventions worth keeping

**Test the user's path, not the implementation.** Suites drive the UI. They break
when behaviour breaks and survive refactors, which is the point.

**Assert on specific messages.** Checking for `/already taken/` rather than "an
error appeared" catches a wrong-but-present message.

**A failing assertion is often a bad test, not a bug.** Of ~40 failures across
this project's suites, roughly a quarter were wrong assertions: a `min(2)` length
rule that `"Zz"` legitimately passes, a `locator("main section")` against a
component that renders a `div`, and `localStorage.clear()` calls that wiped the
mock database along with the session. Each was fixed in the test, with a comment
saying why — that way the next person does not "fix" it back.

**Sign out over HTTP, not by clearing storage.** The session is an httpOnly
cookie, so the page cannot read or clear it — `localStorage.clear()` would be a
no-op on the session and a data wipe on the mock. Five suites call
`POST /api/auth/logout` instead. If you switch back to the mock, the sign-out
helper has to change with it.

**Measure, do not assume.** The print-layout check asserts real geometry because
the stylesheet can look correct and still print a blank page — which is exactly
what happened twice during development.

## Before any release

```
unit        18/18
typecheck   0
lint        0
build       0
smoke       187/187
```

Backend gates, in `../backend` (CI runs these on every push):

```
npm test           15 unit tests, no DB
npm run test:e2e   224 tests, spins up its own in-memory replica set
```

The last full local run was 224 e2e + 15 unit = 239 on the backend, 18 unit on
the frontend, and 187/187 smoke checks.
