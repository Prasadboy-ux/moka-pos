# Testing & verification

154 automated checks across 7 Playwright suites, run against the **production
build** — not the dev server. All pass. No console errors in any suite.

## Running

```bash
npm run build
npm run start          # terminal 1 — required
npm run smoke          # terminal 2 — all suites, sequential
```

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

Plus the static gates, which run with no server:

```bash
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

### `smoke:journey` — 26

One sale followed all the way round: till → receipt → cart cleared → dashboard
reflects it numerically → movement ledger → today's report. It also covers the
**oversell clamp** — the stepper cannot be pushed past the shelf — which reads
the seed straight out of storage rather than pinning a product name, so it
survives the menu being reworked. This covers the *joins* between screens, which
is where a data-layer swap breaks things.

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

## What is not covered

Honest gaps, not oversights.

- **No unit tests.** No test framework is committed. The highest-value targets
  are the pure functions: `summarise`, `trend`, `categorySales`, `maxServings`,
  `canFulfill`, `lowStockItems`, and the receipt/CSV builders. These are where
  unit tests pay off most, and they are cheap to add.
- **No component tests.** Every screen is covered through the browser instead,
  which is slower but closer to real use.
- **No visual regression.** Screenshots were inspected by hand during
  development; nothing compares them automatically.
- **No CI.** `typecheck`, `lint`, `build`, and `smoke` are all scripted and ready
  for GitHub Actions. Nothing runs them yet — this is the cheapest meaningful
  addition.
- **One browser.** Chromium only.
- **No load or performance testing.** The mock store returns everything at once,
  so paging behaviour under real volume is untested by definition.

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

**Never wipe the whole store.** The mock database lives in `localStorage`, so
signing out means removing only `moka-pos.auth`. Clearing everything resets the
cafe mid-suite and turns the next assertion into a mystery.

**Measure, do not assume.** The print-layout check asserts real geometry because
the stylesheet can look correct and still print a blank page — which is exactly
what happened twice during development.

## Before any release

```
typecheck   0
lint        0
build       0
smoke       154/154
```

With a backend in place, add: the suites re-run **unchanged** against the real
API, plus the concurrency case the mock cannot produce — two tills selling the
last unit of the same item, where exactly one must succeed.