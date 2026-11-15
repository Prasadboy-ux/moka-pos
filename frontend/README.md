# Moka Cafe POS — Frontend

Point of sale for Moka Cafe. Next.js 16 + TypeScript, talking to an Express 5 +
MongoDB API in [`../backend`](../backend/README.md) over an httpOnly cookie
session.

> **This README is the living changelog.** Every update gets an entry in
> [Changelog](#changelog) — append newest first, never rewrite history.

> **Requirements docs?** [`docs/`](./docs/README.md) — PRD, TRD, API contract,
> testing, design system.

---

## Where the project stands

The frontend is complete and now runs against a real server. There is no mock in
the request path.

| Area | State |
|---|---|
| Toolchain | Done — Next 16, TypeScript strict, Tailwind v4, shadcn/ui |
| Design system | Done — brand tokens from logo palette |
| Login (Kasir / Admin) | Done — server sessions, three distinct refusals |
| App shell + role routing | Done — client guard **and** server enforcement |
| POS + checkout + receipt | Done — cash, QRIS, debit, credit, PPN |
| Transactions | Done — search, reprint, WhatsApp send |
| Menu illustrations | Done — 20 illustrated items |
| Admin Overview dashboard | Done — KPIs, trend, payment mix, low stock |
| Product management | Done — CRUD, recipe editor, categories, archive |
| Stock management | Done — levels, adjustments, movement ledger |
| Reports | Done — date range, period comparison, CSV export |
| User management | Done — create, role, activate/deactivate |
| Selling moves stock | Done — server-side Mongo transaction |
| Interface guidelines | Done — touch targets, reduced motion, print, URL state |
| Repository seam | Done — flipped from mock to HTTP in one file |
| Backend API | Done — 41 routes, 9 models, 342 tests |
| Shift gating + reconciliation | Done — POS refuses to sell with no open shift; close stores the drawer count |
| Unit tests (frontend) | Done — Vitest, 30 tests across 4 files |

**Screens:** 8 routes (login + 7 dashboard screens). Cashiers reach 2 of them,
admins reach all 7.

## Tech stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.4.2 |
| Language | TypeScript (`strict`, `noUncheckedIndexedAccess`) | 5.9.3 |
| UI | React | 19.3.1 |
| Styling | Tailwind CSS (CSS-first config) | 4.3.3 |
| Animation | Motion for React (`motion`) | 14.6.0 |
| Components | shadcn/ui (`new-york` style) | 4.22.0 |
| Forms | react-hook-form + zod | 7.90.0 / 4.6.7 |
| State | Zustand (auth, cart) | 5.0.15 |
| HTTP | axios | 1.x |
| Icons | lucide-react | 1.59.0 |
| Validation | ESLint 9 flat config | 9.39.5 |
| Verification | Playwright smoke scripts | 1.64.1 |

99 TypeScript files, ~12,400 lines under `src/`.

## Getting started

Three processes: the local database, the API, and the frontend. The API and the
database must both be running or login shows **"Cannot reach the server."**

```bash
# terminal 1 — local MongoDB (leave running; syncs MONGODB_URI into backend/.env)
cd ../backend
npm install
cp .env.example .env
npm run mongo

# terminal 2 — API on :3001
cd ../backend
npm run seed              # demo catalogue + 30 days of orders
npm run dev

# terminal 3 — frontend on :3000
npm install
cp .env.local.example .env.local
npm run dev
```

`API_PROXY_TARGET` is the only frontend setting you normally need. The browser
calls this app's own `/api` path and Next.js rewrites it to that target, so the
session cookie stays on one origin. Set `NEXT_PUBLIC_API_URL` only when the
browser must call the API directly; it is public on purpose, and because the
session is an httpOnly cookie, no token or API key belongs there.

### Sharing the site on your network

With the proxy setup above, no per-device configuration is needed. Start the
frontend normally and open `http://<your-lan-ip>:3000` from a phone or another
computer — the page uses its own host for API calls, so `localhost` is never
baked into the browser bundle. Allow Node.js through the Windows firewall for
private networks, and keep the API on the same machine as the frontend.

If you set `NEXT_PUBLIC_API_URL` instead, it must be an address every device can
reach (for example `http://192.168.0.179:3001`), and the backend's
`CORS_ORIGIN` must include the frontend origin (for example
`http://192.168.0.179:3000`). A `localhost` value there works only on the machine
running the API.

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run smoke` | All browser smoke suites (needs both servers) |
| `npm run smoke:ci` | Start Mongo + API + built frontend, run all suites, tear down |

### Verification

`npm test` runs Vitest over the read models, the cart store, and the checkout
idempotency helpers. It needs no browser, server, or database. CI runs it before
Build.

`scripts/` holds eight Playwright suites that drive the real UI against a
production build **and a live API**. They are why several bugs below were caught,
so they are worth running after any change to the data layer.

```bash
npm run build
npm run start          # terminal 1 - frontend on :3000
npm run smoke          # terminal 2 - API must be up and seeded on :3001
```

Or let one command own the stack. Build both projects first, stop anything on
ports 3000/3001, then:

```bash
$env:API_PROXY_TARGET = "http://localhost:3001"   # PowerShell, at build time
npm run build
npm run smoke:ci
```

`smoke:ci` starts an in-memory MongoDB, seeds it, boots `backend/dist/server.js`
and `next start`, waits for `/api/health` and `/login`, runs all eight suites,
and kills every process it started, including on failure. This is the command
`.github/workflows/smoke.yml` runs weekly and on demand.

| Suite | Covers | Checks |
|---|---|---|
| `smoke:auth` | session probe, login rate limit, recovery after refusal | 6 |
| `smoke:screens` | acceptance pass over all seven dashboard screens | 47 |
| `smoke:products` | catalogue CRUD, filters, sorting, archive, role gate | 27 |
| `smoke:reports` | ranges, presets, empty periods, CSV contents, role gate | 25 |
| `smoke:stock` | adjustments, refusal of over-withdrawal, ledger, a sale moving stock | 18 |
| `smoke:users` | create, duplicate rejection, sign-in, deactivation, last-admin guard | 18 |
| `smoke:journey` | one sale followed through till, dashboard, ledger, and report, plus the shift gate | 31 |
| `smoke:a11y` | document metadata, skip link, reduced motion, URL state, print geometry | 22 |

**194 checks total.** They run sequentially and share one session, because each
signs in, changes data, and signs out again — parallel runs would fight over
the same account.

Note that five of the eight suites sign out over HTTP (`POST /api/auth/logout`),
not by clearing browser storage: the session cookie is httpOnly, so the page
cannot read or delete it.

## Demo accounts

| Role | Username | Password | Lands on |
|---|---|---|---|
| Admin | `admin` | `admin123` | `/dashboard` |
| Cashier | `kasir` | `kasir123` | `/dashboard/pos` |

The login screen lists these as click-to-fill buttons. The seed also creates a
deliberately deactivated `kasir2` account so the "account disabled" refusal can be
demonstrated.

### Troubleshooting sign-in

| Symptom | Cause and fix |
|---|---|
| **"Cannot reach the server"** | The API is not running or not reachable. It exits at startup when MongoDB is down, so start `npm run mongo` (backend, leave it running), then `npm run dev` (backend). `curl http://localhost:3001/api/health` should answer `{"status":"ok","db":"up"}`. |
| Backend exits with `ECONNREFUSED 127.0.0.1:27019` | MongoDB is not running (or `MONGO_PORT` was overridden). Start `npm run mongo`; it rewrites `MONGODB_URI` in `backend/.env`. The in-memory database starts empty, so run `npm run seed` again after a restart. |
| **"That username and password do not match an account"** | The database is empty. Run `npm run seed` in `backend/`. |
| Sign-in succeeds, then the next reload signs out | The cookie is not being stored. On HTTPS set `COOKIE_SECURE=true`; on plain HTTP set it to `false`. If the API is called directly across different sites, use the proxy setup above instead. |
| A deployed build still calls `localhost` | `NEXT_PUBLIC_*` values and the `API_PROXY_TARGET` rewrite are resolved at build time. Change the environment variable and rebuild/redeploy. |

## Screens

| Route | Screen | Roles | What it does |
|---|---|---|---|
| `/login` | Sign in | — | Role picker, credential check, three distinct refusals |
| `/dashboard` | Overview | admin | Revenue today, average order, items sold, low stock, 7-day trend, payment mix, recent sales |
| `/dashboard/pos` | Point of Sale | kasir, admin | Searchable tile grid, cart with steppers, subtotal/PPN/total, checkout across four payment methods, 80 mm receipt |
| `/dashboard/transactions` | Transactions | kasir, admin | Every sale in a range, filter by payment, search by receipt or customer, **reprint** from the stored order, WhatsApp send |
| `/dashboard/products` | Products | admin | Catalogue CRUD, recipe editor with live cost roll-up, category manager, archive instead of delete |
| `/dashboard/inventory` | Inventory | admin | Ingredient levels and reorder points, counted packaged stock, full movement ledger |
| `/dashboard/reports` | Reports | admin | Date range with presets, period-over-period comparison, revenue per day, payment mix, category revenue, top products, per-cashier takings, CSV export |
| `/dashboard/users` | Users | admin | Create, edit, role assignment, activate/deactivate |
| `/dashboard/security` | Security | admin | Two-factor status, remaining recovery codes, regenerate codes, change password |

## Project structure

```
src/
  app/
    (auth)/login/          Login screen
    dashboard/             Admin area (role-gated layout)
      layout.tsx           Shell + auth/role guard
      page.tsx             Overview
      pos/                 Point of Sale
      transactions/        Sales history + receipt reprint
      products/            Product management
      inventory/           Stock management
      reports/             Reports
      users/               User management
      error.tsx            Route error boundary
      not-found.tsx        Styled 404
  components/
    ui/                    22 shadcn primitives
    auth/                  LoginForm, RolePicker
    brand/                 BrandPanel
    layout/                Sidebar, Header, MobileSidebar
    common/                PagePlaceholder
    dashboard/             StatCard, OverviewWidgets, AdminOverview
    pos/                   PosScreen, ProductGrid, CartPanel,
                           CheckoutDialog, ReceiptModal
    transactions/          TransactionsScreen
    products/              ProductsScreen, ProductFormDialog,
                           CategoryManagerDialog
    stock/                 StockScreen, StockAdjustDialog
    reports/               ReportsScreen
    users/                 UsersScreen, UserFormDialog
    DataTable, FilterBar, ConfirmDialog, PageHeader
  hooks/
    useAsync.ts            One data-loading hook for every screen
    useDebouncedValue.ts   Trailing value for search boxes
    useQueryState.ts       URL as the source of truth for filters
  lib/
    utils.ts               cn()
    format.ts              IDR currency, dates
    csv.ts                 Quoted, formula-safe CSV export
    receipt.ts             Plain-text receipt + WhatsApp deep link
    auth.ts                StoredUser -> User, the only password boundary
    demo.ts                Demo accounts shown on the login screen
    access.ts              canAccess / matchNavItem (route guard source of truth)
    nav.ts                 Navigation config + role permissions
    repositories/
      types.ts             The interfaces every screen codes against
      index.ts             getRepositories() — the swap point
      read-models.ts       Dashboard and report aggregations
      http/                LIVE implementation — talks to the API
        client.ts          axios instance, ApiError, error normalisation
        catalog.ts         category, ingredient, product, user
        commerce.ts        stock, order, shift, session
      mock/                Offline fallback — localStorage backed
        db.ts              Versioned document, atomic read-modify-write
        seed.ts            Fixtures and 30 days of order history
        helpers.ts         Latency, slug, id uniqueness
        categories.ts  ingredients.ts  products.ts
        stock.ts           The only writer of stock numbers
        orders.ts          Order writes + stock consumption, one transaction
        users.ts           Accounts and credential checks
        shifts.ts          Shift records — the sell gate and reconciliation live in the API
  store/
    useAuthStore.ts        In-memory session, rehydrated from GET /auth/me
    useCartStore.ts        POS cart
  types/
    auth.ts                Role, User, Session, ROLE_HOME
    pos.ts                 Product, Order, Ingredient, Shift, stock rules
scripts/                   Playwright smoke suites
docs/
  PRD.md                   Product requirements: screens, rules, scope
  TRD.md                   Technical requirements: architecture, data model
  API-CONTRACT.md          What the backend must provide
  TESTING.md               Suites, coverage, and what is missing
  DESIGN.md                Tokens, touch, motion, print, component checklist
asset/menu/                SOURCE artwork, 20 SVGs, labels intact
public/menu/               Served artwork, 20 SVGs, labels stripped
public/brand/
  moka-logo.svg            Full logo card (mark + wordmark + tagline)
  moka-mark.svg            Icon-only mark for small UI slots
src/app/favicon.ico        Generated from the brand mark
```

## Architecture decisions

**Screens depend on interfaces, not on the data layer.** `getRepositories()`
returns eight repository objects declared in `lib/repositories/types.ts`. The only
file naming an implementation is `lib/repositories/index.ts` — which is why the
move from mock to HTTP was **one file and 27 lines**. Every method is already
async, which is what made that true; a mock that answered synchronously would
have forced every call site to change shape later.

**The session is an httpOnly cookie, and it is the only one.** The store holds no
persistence middleware. `useAuthHydrated()` calls `GET /api/auth/me` once per
document and every guard waits on it. There was a `localStorage` session before
this; it meant two sources of truth, and a cookie readable by neither is strictly
simpler. `axios` sends it with `withCredentials: true` rather than an
interceptor, because there is no token to attach.

**The API client fails at the call, not at import.** `http/client.ts` creates its
axios instance lazily behind a `Proxy`. A missing `NEXT_PUBLIC_API_URL` used to
throw at module load, which aborted the entire production build — even though the
variable is only needed by the one request that needs it.

**Errors are one type, not seven.** `ApiError` carries the server's code, status,
and reason. `toApiError()` normalises everything axios can throw, including "no
response at all", which becomes a readable "Cannot reach the server" instead of a
generic failure. `message` is used verbatim because the server writes it as a
user-facing sentence ("Only 5000 gram on hand").

**A retry at the till must not mint a second receipt.** The checkout dialog
creates one `Idempotency-Key` when it opens and reuses it across retries; the
server stores it. On flaky cafe wifi the checkout is resent; the server replays
the original order and answers `200` with `Idempotent-Replay: true` instead of
creating a second sale.

**Identity is stripped from request bodies.** The interfaces carry `actor` and
`cashier` so the mock has a session to read. The HTTP implementation deletes both
before sending, because the server takes the actor from the cookie. Three call
sites do this explicitly rather than trusting the type system.

**404 means `undefined`, not an exception.** `getById` promises `T | undefined`;
the HTTP layer catches a 404 and returns `undefined` so no caller has to learn
that a missing record throws.

**Stock is the server's problem now, in one transaction.** `POST /api/orders`
writes the order, decrements stock, and appends ledger rows atomically, with
conditional `$inc` decrements so two tills cannot both sell the last pastry. The
frontend's `mock/stock.ts` still exists as the only writer of stock numbers *in
the mock*, and keeps the same discipline.

**Aggregations live in read models, not in screens.** The dashboard, reports, and
transactions screens all need the same sums, and a screen-local copy of that
arithmetic would drift from the others.

**Role gating is enforced twice, and now only one of them counts.** The sidebar
only renders links a role can use, *and* `dashboard/layout.tsx` blocks rendering
and redirects. Both are client-side and both are presentation. The real check is
`requireRole` in `backend/src/middleware/session.ts`, which re-reads the user
document on every request.

**Nothing is hard-deleted, except where history makes it safe.** Products archive
and users deactivate, because sales reference both by id. Ingredients have no
delete route at all, because it would orphan recipe rows. Products *can* be
deleted, because order lines denormalise the name and price at sale time.

**Money is integer rupiah everywhere.** No floats, in the client or the server.

**`minStock` is a reorder threshold, not a sell block.** Items stay sellable down
to zero; crossing `minStock` raises an admin alert.

## Brand tokens

Defined in `src/app/globals.css`, lifted from `asset/logo/moka-logo.svg`:

| Token | Value | Use |
|---|---|---|
| `--brand-cyan` | `#00c4df` | Logo accent, gradient start |
| `--brand-teal` | `#009bb0` | Cyan gradient end |
| `--brand-blue` | `#1b75bc` | Accent |
| `--brand-navy` | `#0f4c81` | Gradient end |
| `--brand-ink` | `#0f2027` | Foreground text |
| `--primary` | `#00a5bd` | Buttons, active states |

`--primary` is the logo cyan darkened slightly so white text on top of it clears
WCAG AA contrast. A `.dark` block is defined but not yet reachable in the UI.

## The backend, in brief

The frontend owns the contract; the backend implements it. Full detail in
[`../backend/README.md`](../backend/README.md) and
[`../backend/docs/ARCHITECTURE.md`](../backend/docs/ARCHITECTURE.md).

| | |
|---|---|
| Framework | Express 5, ESM, TypeScript strict |
| Database | MongoDB via Mongoose 9 |
| Auth | httpOnly `moka_session` cookie, HS256 JWT via `jose`, Argon2id password hashing with scrypt verification and migration |
| Routes | 41 contract endpoints + `/api/health` |
| Models | 9 collections with indexes |
| Tests | 342 — 301 e2e across 15 files (Supertest + in-memory replica set) + 41 unit |
| Lint | oxlint (type-aware) + Prettier |
| Hardening | Login + API rate limits, pino logging, compression, CI |

The endpoint list is derived from `src/lib/repositories/types.ts` and written up
in [`docs/API-CONTRACT.md`](./docs/API-CONTRACT.md). `backend/test/contract.e2e.ts`
asserts all 41 routes against that document **transcribed by hand**, so the test
checks the contract rather than restating the code.

Dates cross the wire as `yyyy-mm-dd` in `STORE_TIMEZONE` (Asia/Jakarta by
default) — parsed as a bare date, a `to` bound lands at midnight and silently
drops that day's sales, which is a bug the mock had and the server fixed
deliberately.

---

## What comes next

Ordered by what earns its keep first.

1. **Deployment.** Hosting is settled — Vercel for this app; the API deploys as
   its own Vercel project on the Express preset, where the root `backend/index.ts`
   becomes a single function that keeps every request path intact, with Railway
   or Render as alternatives, and MongoDB Atlas for the data. Set
   `API_PROXY_TARGET` here to the API project's production domain, and on the API
   set `MONGODB_URI`, `SESSION_SECRET`, `CORS_ORIGIN`, `COOKIE_SECURE=true`, and
   `NODE_ENV=production`, plus Atlas Network Access for Vercel. The target must
   be a permanent URL: a `trycloudflare.com`/ngrok tunnel makes the deployed site
   depend on whichever laptop is running it. See
   [`../backend/README.md`](../backend/README.md#deploying-to-vercel). CI already
   runs the backend suite, frontend unit tests, and the frontend build on every
   push.
2. **Real prices and supplier costs.** `costPerUnit` is rupiah per ml/gram now but
   the numbers are invented. Supplier invoices make margin, COGS, and gross profit
   real — and the product form already shows cost, margin, and gross per cup, so
   the UI needs no change.
3. **What the cafe will ask for:** discounts and promotions (no concept exists),
   split bills and table service, product photo upload (needs a storage
   decision), and a kitchen display / order queue.
4. **Dark mode.** The palette and tokens exist; only the toggle is missing.
5. **Indonesian copy.** The copy and dates are English; the currency, number
   grouping, and the `PPN` tax acronym stay Indonesian, which is correct for the
   setting. A copy pass rather than a refactor — but `<html lang>` and the date
   locale would have to move with it, and `smoke:a11y` asserts `lang`.

---

## Changelog

### 2026-10-30 - Next 16 proxy, CI smoke, and checkout retry safety

`src/middleware.ts` became `src/proxy.ts` with `export function proxy`, which
silences the Next 16 deprecation without changing the cookie gate. `next.config.ts`
pins the Turbopack root to this app, adds baseline response headers (with HSTS
only in production), and keeps the `/api` rewrite.

Checkout now keeps one `Idempotency-Key` for an unchanged cart
(`lib/idempotency.ts`), reuses it after a failed request, and clears it after a
completed sale. The dialog cannot be dismissed while the POST is in flight, so a
sale that commits on the server always has a mounted receiver for the receipt.
Unit tests cover the key signature and reuse rules.

`scripts/smoke-ci.mjs` starts and stops the whole stack and runs all 194 checks;
`.github/workflows/smoke.yml` runs it weekly and on demand. The product
create/update validation queries now share the writing transaction's session, so
a category or ingredient deleted mid-request aborts the write. The demo-account
panel is hidden unless `NEXT_PUBLIC_DEMO_CREDENTIALS=true` is set at build time.

### 2026-10-28 — Login: demo accounts are click-to-fill again

The seeded admin and cashier accounts are listed under the sign-in form as
click-to-fill buttons, matching the Demo accounts table above. The refactor to
the repository layer dropped the old panel; it now reads from
`components/auth/demo-credentials.ts` and fills the role picker, username, and
password without submitting. `smoke:screens` asserts both buttons are present.

### 2026-10-28 — Transactions: "Last 12 months" replaces "All time"

The backend now rejects sales-report ranges longer than 366 days because the
aggregate is computed from every matching order in Node. The transactions
screen's "All time" preset asked from `2000-01-01`, which made that request
fail. Its widest preset is now **Last 12 months** (`monthStartMonthsAgo(11)`),
the same window shape as the reports screen; twelve calendar months fit inside
the cap, including a leap day. The ledger table and the KPI tiles share the
window, and the header names the resolved dates. `smoke:screens` checks the new
button and opens `?range=12m`.

### 2026-10-25 — Premium animation system: Motion everywhere, one token source

Upgraded the motion layer from a partial Motion setup with scattered hardcoded
timings to a system: `tw-animate-css` CSS cues were replaced by Motion-driven
enter/exit choreography in the primitives, and every timing now reads from
`src/lib/motion.ts`.

**Token unification.** `lib/motion.ts` is the single source of truth — durations
`fast` 0.16 / `swap` 0.18 / `base` 0.24 / `page` 0.34 / `flight` 0.48, the
`EASE_OUT` curve, `SPRING`/`SPRING_SOFT`, and `collapse`/`pop` variants with
per-value transitions. Over two dozen bare durations across `MotionProvider`,
`PageTransition`, `FlyToCart`, toasts, the checkout, login, cart, and product
grid were replaced with named tokens. Two
deliberately remain bespoke: `SuccessCheck`'s SVG draw and the checkout shake.

**Overlays animate out.** Radix unmounts portals instantly, so `dialog`,
`alert-dialog`, `dropdown-menu`, and `select` were rewritten to own `open` via a
new `overlay-motion.tsx` steward (`useControlledOpen`) and host their content in
`AnimatePresence` inside a `forceMount` portal — overlays now fade/scale out on
close, and dropdowns/selects get directional pop + rotation of their trigger
chevron. `tabs` gained a sliding `layoutId` underline for the `line` variant
(sidebar-pill gloss).

**Dialog bodies restructured to match.** Stateful bodies mount *through*
`DialogContent` as children (not sibling conditionals), so each open starts with
clean state while `AnimatePresence` keeps the last content for the exit:
`CheckoutDialog`, `UserFormDialog`, `ChangePasswordDialog`, `IngredientDialog`,
`ProductFormDialog`, `StockAdjustDialog`, `VoidOrderDialog` (pending guard moved
into a ref that survives body unmount), `ReceiptModal`, and `OpenShiftDialog`.
`CloseShiftDialog` merged its two conditional contents into one shell with an
inner `mode="wait"` swap, and `TransactionsScreen` dropped its per-order re-key.

**POS + dashboards polish.** FilterBar chips and cart steppers press with
`whileTap`; the cart badge re-pops per increment; grid/run-out empty states
animate in; `DataTable` rows stagger on mount, page, and sort with an animated
sort chevron; dashboard and reports KPI figures count up via a generalized
`AnimatedNumber` (`format` prop); reports trend bars and payment mix now stagger
in step with the dashboard widgets; report skeletons use the pulsing `Skeleton`;
`EmptyState` fades up.

**Verification.** `typecheck`, `lint`, `vitest` (20/20), and `build` all pass.
Brand palette untouched — cyan/teal identity, WCAG `--primary`, and the print
receipt rules all preserved; reduced-motion guarantees are asserted by
`smoke:a11y`.

### 2026-10-23 — Split-repo CI and mock ledger parity

- Added `.github/workflows/ci.yml` so the standalone `fe-moka-pos` repository
  runs lint, typecheck, unit tests, and build on every push.
- The mock product repository now writes the opening count as a `purchase`
  movement through `recordOpeningStock`, attributed to a system actor because
  the mock has no session, matching the HTTP path's ledger behavior.

### 2026-10-23 — Remediation: unit tests, regressions, deployment entry

The audit remediation is complete. Backend e2e is 224/224 across 10 files plus
15/15 unit tests; frontend Vitest adds 18 tests for revenue allocation, calendar
keys, dashboard ranges, and cart totals.

- Fixed the stale backend expectations for direct/recipe product shape, the
  partial unique open-shift index, and the auth `reason` envelope.
- Added regressions for opening stock, edit-never-writes-stock, stock signs,
  inactive-product and underpayment refusal, auth failure reasons, duplicate
  shifts, sale-vs-close, concurrent last-admin demotion, concurrent duplicate
  usernames, and the `/api/config` contract route.
- Duplicate-key races on user create/update now return `409 username-taken`
  rather than a 500.
- `Intl.DateTimeFormat` instances are cached per timezone, removing the
  cold-start timeout in the dates spec.
- The Vercel entry is the root `backend/index.ts` on the Express preset — one
  function, every path intact. The earlier `api/[...path].ts` catch-all matched a
  single segment only, so nested routes never reached Express.
- Refreshed `docs/API-CONTRACT.md` with eight repositories, config, product JSON,
  stock signs, revenue allocation, timezone behavior, and idempotency lifecycle.
- Smoke suites pass 187/187 across 7 suites against an isolated seeded replica
  set and the production build.

### 2026-10-23 — Milestone 7: design audit pass — contrast, tablet till, token discipline

A full review against the Vercel Web Interface Guidelines and the project's own
`docs/DESIGN.md`, which several rules in the code did not actually meet.

**Contrast, which the design doc certified but did not have**

`--primary` was `#00a5bd` and claimed to clear WCAG AA — it measures ≈3:1 with
white, failing for every primary button, active sidebar item, chip, and the
product tile prices. It is now `#007a87` (≈5:1), with `--ring` and
`--sidebar-primary` moved with it. The bright logo cyan stays in
`--brand-cyan` for gradients and non-text accents. The focus ring was also
invisible — `#00c4df` at `ring/50` — and is now full-opacity.

**The till on a tablet**

The POS two-column layout started at `xl` (1280px), so iPad landscape
(1024–1279px) stacked the cart under the entire menu grid. It now splits at
`lg`, keeping the sticky cart beside the tiles where the Charge button stays
reachable during a rush.

**Touch targets** — category chips (POS and admin) went 30px → 40px minimum,
cart "Clear" from a ~16px bare text button to 40px, the dialog close × to
40px, sidebar links to 40px min-height, and the default `Button` scale is one
step taller than stock shadcn (`default` h-10, `sm` h-9).

**Checkout correctness** — the phone field showed a destructive error and
`aria-invalid` on an empty optional field; it now only fires once something is
typed. Payment tabs kept their accessible names below `sm` (`sr-only` instead
of `display: none`). A disabled **Complete sale** now explains itself ("Enter
at least Rp 33.000 more…") via `aria-describedby`, and the Still-due readout
is a polite live region.

**Tokens** — new `--success` / `--warning` (light + dark) mapped through
`@theme`, replacing raw `emerald`/`amber` utilities in the shift screens and
the POS status dot. `--brand-*` is now exposed as theme colors, killing four
copy-pasted gradient hex pairs. One `cn` import everywhere (`@/lib/utils`).

**Consistency** — full-page spinners replaced with layout-matching skeletons
(POS grid, dashboard, auth gate shell); errors unified on the `Alert` pattern
with a **Try again** action; empty states unified on `EmptyState`. The app
header renders the route as muted chrome and `PageHeader` owns the screen's
`h1`, ending the duplicated equal-weight titles. Trend axes use `en-GB` via a
shared `formatWeekdayDay` helper instead of a raw `id-ID` `Intl` call; the
`credit` payment icon is a `CreditCard` everywhere; StatCard values carry a
`title` and step up to `text-2xl`. Search placeholders end in `…` with the
accessible label kept clean. The skip link gained its `#main` target on
/login.

**Verification** — `typecheck`, `lint`, `build` exit 0. 187 browser checks,
7/7 suites, after the change.

### 2026-10-20 — Milestone 6: shift gate at the till, hardening, green smoke

**The POS now requires an open shift.** A gate panel blocks the grid and offers
the one action available (Open shift); the status strip shows the open shift with
a Close shift button. Closing displays the server-computed reconciliation — cash
sales, expected drawer, variance — from the same transaction that closes the
shift. Checkout maps the server's `no-open-shift` refusal back to the gate.

**The smoke suites are green against the live API** — 187 checks, 7/7. Getting
there surfaced four real bugs: an infinite `router.replace` loop in
`useQueryState` (a new `useSearchParams()` identity per navigation re-ran the
search-sync effect forever, which is why `networkidle` never settled), a 422 on
any checkout carrying customer details (`email: null` failed the backend's
`z.string()`), a race where two rapid date writes dropped the first field, and
data leakage between runs (a leftover product and a leftover user each broke
their suite's next run).

**Backend hardening:** login and API rate limits (env-tunable, off under
`NODE_ENV=test`), pino structured logging, response compression, and concurrency
tests proving two tills cannot oversell the last unit — five simultaneous orders
for ten bottles sell exactly three and refuse the rest. CI runs backend
lint/typecheck/unit/e2e and frontend lint/typecheck/build on every push.

### 2026-10-18 — Milestone 5: backend built, frontend swapped to it

The frontend stopped being self-contained. `backend/` is a working Express 5 +
MongoDB API, and the seven repositories now resolve to HTTP. **The mock was not
deleted** — it is still on disk at `lib/repositories/mock/*`, which is the fastest
way to work on a screen without a database running, and it remains the fallback
when `NEXT_PUBLIC_API_URL` is unset.

**The backend** (12 commits, `415868e`…`b3adde3`)

- A NestJS scaffold was replaced with **Express 5** rather than worked around —
  the generated structure fought the codebase at every layer.
- 9 Mongoose models with deliberate indexes: unique `receiptNo`, `createdAt` for
  the ledger and reports, `cashierId` for takings, and a **TTL index on
  idempotency keys** so they expire after 7 days instead of accumulating.
- Sessions are an **httpOnly `moka_session` cookie** holding an HS256 JWT. Role
  and active status are deliberately *not* in the token; `requireSession`
  re-reads the user document on every request, so deactivating an account takes
  effect immediately rather than at token expiry.
- Passwords use `node:crypto` scrypt — no native module to compile. A missing
  user still runs a real `verifyPassword` against a dummy hash, so login timing
  does not reveal whether a username exists.
- The three login refusals (invalid, inactive, role-mismatch) stayed distinct
  because the login screen branches on them. The password is verified *before*
  `inactive` is reported, so a deactivated account cannot be probed for.
- **342 tests** (301 e2e across 15 files + 41 unit). `contract.e2e.ts` asserts all 41 routes against
  the API contract transcribed by hand rather than copied from the code, and
  `models.e2e.ts` asserts the *absence* of indexes and collections from earlier
  drafts — `/api/transactions`, `/api/stock_history`, and `/api/reports/sales`
  must 404.

**The frontend swap** (`5cec204`, 13 files, +606/−61)

- `lib/repositories/index.ts` — the seven imports changed. That is the whole
  swap, which is the claim the architecture was built to support.
- `lib/repositories/http/client.ts` — axios instance, `ApiError`, and a single
  `request()` choke point that normalises everything thrown. `withCredentials`
  instead of an interceptor, because a cookie needs no header.
- `lib/repositories/http/catalog.ts` and `commerce.ts` — the seven repositories,
  plus a `sessionRepository` for `GET /auth/me` and `POST /auth/logout`.
- `store/useAuthStore.ts` — persistence middleware removed. The cookie is the
  only session; `useAuthHydrated()` fetches it once per document.
- Three things in the HTTP layer that are not obvious: an **`Idempotency-Key`**
  per `create()` so a resent checkout cannot mint a second receipt; **identity
  stripped from bodies** at three call sites, because the server takes the actor
  from the cookie; and **404 translated to `undefined`** so `getById` keeps its
  `T | undefined` promise.

**One fix on top, uncommitted**

`client.ts` threw at module load when `NEXT_PUBLIC_API_URL` was unset, which
aborted the whole production build — the variable is needed by one request, not
by the import graph. The instance is now created lazily behind a `Proxy`, so the
error surfaces on the request that needs it. `typecheck`, `lint`, and `build` all
exit 0 with no `.env.local` present.

### 2026-10-18 — Milestone 4: transactions, monthly reports, product delete

- **Transactions screen** — every sale in a range (Today / 7 days / 30 days /
  All time), filter by payment method, search by receipt number or customer,
  client sort and paging, and four summary tiles over the filtered set.
  **Reprint reopens the same `ReceiptModal` the till uses**, so the printed
  document is the original stored order rather than a re-priced reconstruction.
  A WhatsApp deep link sends the plain-text receipt when the sale has a number.
  Cashiers get this screen — it is how a reprint or a dispute gets settled at
  the counter, which is why it is the one admin screen they can open.
- **Monthly reports** — the report range gained a month preset and comparison
  against the equivalent period a month earlier.
- **Product delete** — products could previously only be archived. Hard delete
  became safe once order lines denormalised the product name and price at sale
  time, so a deleted product cannot break a historical receipt.
- **English locale, settled** — `lang="en"`. The copy and dates are English; the
  currency, number grouping, and the `PPN` acronym stay Indonesian, which is
  correct for the setting. A screen reader reading `lang="id"` English copy with
  Indonesian phonetics is worse than the alternative.
- Nav grew to 7 items. A cashier sees 2, an admin sees 7.

### 2026-10-17 — Milestone 3b: interface guidelines pass

Reviewed against the Vercel Web Interface Guidelines, focused on the POS because
that is where the app is touched most and by hand. 33 findings, all fixed.

**Touch, which matters most at a till**

- `touch-action: manipulation` on the body removes the ~300 ms double-tap delay
  from every tile, chip, and stepper. Pinch-zoom still works — only the
  double-tap gesture goes.
- `-webkit-tap-highlight-color: transparent` stops the grey flash on every tap.
- Cart steppers went from 28 px to 40 px, the remove button gained a real hit
  area, quick tender from 32 px to 44 px, and Charge to 48 px. These are pressed
  repeatedly during a rush, by finger.
- The cart's scroll container is `overscroll-contain`, so scrolling a long order
  no longer chains to the page behind it.

**Motion, focus, and confirmation**

- A `prefers-reduced-motion` block collapses every animation and transition.
  Two motion classes are cancelled outright rather than sped up: the infinite
  skeleton pulse (`motion-reduce:animate-none`) and the tile hover zoom
  (`motion-reduce:group-hover:scale-100`), because snapping to a scaled position
  reads worse than not moving at all. The tile's press-down scale is now
  `motion-safe:` only.
- Both `autoFocus` calls removed. The cash field in the checkout dialog was
  raising the software keyboard over the cart on a tablet — the opposite of what
  a cashier wants mid-sale.
- Clearing the order is now confirmed, with the item count and value in the
  prompt. It was one tap away from a dozen-line order, next to the steppers.
- Every `transition-all` replaced with the properties actually animated
  (button, switch, tabs, progress, role picker, product tile). A bare
  `transition-all` also animates whatever a variant changes later.

**Printing a receipt**

`window.print()` was printing the POS grid, the sidebar, and the dialog chrome
with the receipt floating in the middle. Now a print stylesheet isolates
`[data-receipt]` and re-declares it at 80 mm.

Worth recording how this was fixed, because it is not obvious: the receipt is
inside a Radix dialog that Tailwind centres with `translate-x-[-50%]`, and
Tailwind v4 emits that as the CSS **`translate` property**, not `transform`. So
`transform: none` in the print stylesheet did nothing, and the build additionally
strips a literal `translate: none` from the rule. The fix is to zero the custom
properties the utility resolves from (`--tw-translate-x` / `--tw-translate-y`),
which survives minification. Two intermediate attempts made it worse — `position:
static` pushed the dialog to the end of the document flow and off the page
entirely. `smoke:a11y` now asserts the measured print geometry rather than the
stylesheet text, because the stylesheet can look right and still print nothing.

**URL reflects state**

Filters, tabs, and the report range now live in the query string: POS category
and search, products filters, stock tab and movement filter, and the report date
range. Reload keeps your place, back undoes a filter change, and a report can be
linked to. Writes use `replace`, so a filter does not stack a history entry, and
search is written on a debounce so typing never becomes a navigation. Each of
those screens needs a `Suspense` boundary, which the four route files now have.

**Document and inputs**

- `<html lang="en">`, matching the English copy and dates.
- Skip link to `#main`, first tab stop, verified.
- `theme-color` changed from the brand cyan to `#ffffff`, which is the page
  background; the cyan was only ever a header accent.
- `color-scheme` declared for both palettes.
- Explicit `width`/`height` on every menu illustration.
- `name` + `autocomplete="off"` on the search and cash fields, `spellCheck` off
  on usernames, placeholders ending in `…`, and `translate="no"` on the brand
  name in every visible position.
- Safe-area padding under the mobile tab bar.
- Dialogs and selects are `overscroll-contain` and capped at `90dvh`, so a long
  form scrolls inside its dialog instead of off the top of a short screen.

**Verification**

`typecheck`, `lint`, and `build` all exit 0. 117 browser checks across six
suites, including the new `smoke:a11y` at 22/22 covering document metadata, the
skip link, reduced-motion computed styles, URL state surviving reloads, the
clear confirmation, and print geometry.

The receipt print layout was also verified visually under print media rather than
trusted from the stylesheet: 302 px wide (80 mm at 96 dpi), fully inside the
page, with zero elements outside the receipt still painting.

### 2026-10-17 — Milestone 3: repository layer + four admin screens

**Data layer**

`src/services/*` is gone. In its place, `src/lib/repositories/` holds seven
repository interfaces, a `getRepositories()` accessor that names the only
implementation, and a mock behind it. Screens import interfaces; the Express
swap is confined to `lib/repositories/index.ts`. `mock/db.ts` keeps one JSON
document in `localStorage`, reseeding on a `DB_VERSION` mismatch so a schema
change never needs a migration.

`useAsync` replaces the `useState` + `useEffect` + `cancelled` flag that had been
copied into each screen. It sets state only from promise callbacks, deriving
`isLoading` instead of toggling it, which is what the React compiler's
`set-state-in-effect` rule is asking for.

**Selling now moves stock.** Previously a completed sale recorded an order and
nothing else: ingredients never decremented and `StockMovement` existed as a type
with no writer, so the seeded numbers could never move. `orderRepository.create`
now writes the order, consumes stock (recipe → each ingredient, direct → the
item), and appends the ledger rows inside one `mutate`. That snapshot-and-restore
wrapper is what makes a shortfall safe: no receipt, no partial movement.

**Product management** — searchable catalogue, counted category chips, stock-mode
and status filters, sortable paginated table, create and edit with a recipe editor
and a live cost roll-up, category add/rename/reorder/delete, activate toggle, and
archive instead of delete. A recipe item shows how many servings current stock
covers and names the ingredient that limits it, which is the number an admin can
act on; a counted item shows its own level against its reorder point.

**Stock management** — ingredient levels with reorder points and cost cover,
counted packaged stock, and the full movement ledger. Adjustments derive their
sign from the reason (purchase adds, waste removes, correction keeps the typed
direction) and show the resulting level before saving, warning when it lands
under the reorder point. Over-withdrawal is refused at the repository, not just
in the form. Value is reported on two bases — ingredients at unit cost, packaged
stock at selling price — instead of one total pretending they are comparable.

**Reports** — date range with today / 7 / 30 day presets and a hand-picked range.
Every headline figure carries a percentage against the equivalent range
immediately before it, because a total alone cannot be read. Revenue per day,
payment mix, revenue by category, top products, per-cashier takings, CSV export,
and print. The export writes a multi-block file with a UTF-8 BOM, quotes every
cell, and prefixes values starting `=`, `+`, `-`, or `@` so a spreadsheet does
not evaluate them as formulas.

**User management** — accounts are created, edited, given a role, and
deactivated. Never deleted: sales reference the cashier who took them, so letting
someone go means deactivating them. Deactivating the last active admin is refused
in the repository, not only in the UI. Usernames are compared case-insensitively
and limited to characters that can be typed quickly at a till. Password is
required on create and optional on edit.

**Four bugs found by reading the rendered screen, not the code**

1. **The actions menu opened the edit dialog underneath the archive
   confirmation**, so the confirm click was swallowed by the dialog on top and the
   button was simply unclickable. Cause: the row's click handler fired when the
   menu inside it was clicked. Fixed by removing the clickable-row pattern in
   favour of a real button in the name cell — a clickable row was never reachable
   by keyboard anyway.
2. **Every recipe cost read as a rounding error.** `costPerUnit` held
   per-kilogram figures while recipes multiply per gram, so a drink cost Rp 4 and
   every margin showed 100%. Restated as rupiah per single ml/gram; the Caffe
   Latte now costs Rp 9.736 at 65% margin. `DB_VERSION` bumped to reseed.
3. **Ten of twenty products were flagged as needing restocking.** The rule counted
   servings against an arbitrary threshold of four. Replaced with the ingredient
   being at its reorder point, which matches the dashboard's own rule.
4. **The current-account marker rendered as "Budi Santosoyou"** and was announced
   as one word.

**Two data changes**

Seeded history went from 7 to 30 days: with only a week of data, the default
seven-day report had no previous period and every delta read "No comparable
period". Reports now compare like with like.

**Verification**

`typecheck`, `lint`, and `build` all exit 0. 95 browser checks across five
Playwright suites (`npm run smoke`):

| Suite | Result |
|---|---|
| `smoke:products` | 26/26 — CRUD, filters, sort, archive, role gate |
| `smoke:stock` | 18/18 — adjustments, over-withdrawal refused, ledger, a sale moving stock |
| `smoke:reports` | 19/19 — ranges, presets, empty periods, CSV contents |
| `smoke:users` | 18/18 — create, duplicate rejection, sign-in, deactivation, last admin |
| `smoke:journey` | 14/14 — one sale through till, dashboard, ledger, report |

Worth noting for whoever runs these next: five failures during the build were bad
assertions rather than app bugs — a `min(2)` length rule that `"Zz"` legitimately
passes, a `page.locator("main section")` against a component that renders a
`div`, and three `localStorage.clear()` calls that wiped the mock database
alongside the session. The suites now drop only `moka-pos.auth`.

### 2026-10-17 — Milestone 2b: menu illustrations

**Assets**

20 SVGs arrived in `asset/menu/{coffee,non-coffee,snack,retail}/`, ~1 KB each
(19.4 KB total). All share `viewBox="0 0 300 400"`, a `#222` rounded background,
and one warm cafe palette, so they read as a single set.

Two transforms applied to **copies in `public/menu/` only** — the originals in
`asset/menu/` are untouched and keep their text labels:

1. `<text>` label removed. The artwork carried its own product name, which would
   have duplicated the UI label, used `font-family="sans-serif"` instead of
   Inter, and gone stale the moment a product was renamed. The UI is now the
   single source of truth.
2. Background `rx="16"` → `rx="0"`. The square tile crops the portrait art, so
   the baked radius would bleed against CSS rounding.

Verified: 20 copied, 20 text elements stripped, 20 rx normalised, 0 leftovers,
and all 20 originals still contain both `<text>` and `rx="16"`.

**Catalogue aligned to the art** — 18 products became 20. Anything without an
illustration was removed rather than left as an unillustrated gap.

- Removed (9): Espresso, Mocha Latte, Kopi Susu, Kopi Susu Arabica, Es Teh
  Manis, Matcha Latte, Espresso Milo, Oat Latte, Soft Drink Can.
- Renamed (9) to match: Classic Iced Caffe Latte, Iced Cold Foam Cappuccino,
  Iced Lemon Tea, Basque Cheesecake, Avocado Toast, Mineral Water, Coffee Bean
  Bag 250g, Ceramic Mug, Butter Croissant.
- Added (11): Iced Americano, Brown Sugar Boba Milk, Boba Milk Tea Frappe, Iced
  Caramel Macchiato, Iced Mocha Frappe, Chocolate Chip Cookie, Cinnamon Roll,
  Fudge Brownie, Paper Filters, Pour-Over Carafe, Travel Tumbler.

**Prices are placeholders**, flagged with a `PLACEHOLDER_PRICES` constant so the
whole block can be swapped when real pricing arrives.

**Ingredients 10 → 10.** Kept House Blend Beans, Fresh Milk, Sugar Syrup,
Chocolate Sauce, Black Tea Leaves, Ice Cubes, Lemon Juice. Dropped Arabica Beans,
Oat Milk, and Milo Powder, which the new menu no longer uses. Added Boba
Pearls, Brown Sugar Syrup, and Caramel Sauce.

**Stock modes now demo both halves of the model.** 8 drinks use `recipe` and
decrement ingredients; 12 packaged goods and merchandise use `direct` and
decrement themselves.

**Tile redesign.** Square `object-cover` thumbnail on top, name and price below,
cart-count badge, out-of-stock banner, subtle zoom on hover. Images load lazily
as plain `<img>`; `next/image` refuses to optimise SVG without
`dangerouslyAllowSVG`, and these are ~1 KB trusted local assets that gain nothing
from rasterising. Category chips now show item counts. The 3:4 art centre-crops
cleanly once the baked label band is gone.

**Bug found and fixed: order history disappeared when a cashier sold first.**

`createOrder()` wrote to the module-level store before anything had read the
order list, leaving `orders = [newOrder]`. The lazy seed then saw a non-null
value and skipped, so every later read — including the admin dashboard — saw a
single transaction with a one-day trend.

It hid during Milestone 2 because that test signed in as admin and visited the
dashboard *before* touching the POS, which seeded the history first. Signing in
as a cashier and going straight to POS reproduces it immediately.

`createOrder()` now seeds before writing. Confirmed: revenue today went from
Rp 44.000 across 1 transaction to Rp 4.524.300 across 30, with all 7 trend days
populated.

**Verification**

`typecheck`, `lint`, and `build` all exit 0. An 18-check Playwright pass:

| Check | Result |
|---|---|
| Tiles render / images decode | 20 / 20, 0 broken |
| Image 404s | None |
| Category chips | All 20 · Coffee 3 · Non Coffee 5 · Snack 6 · Retail 6 |
| Filter and search | Retail → 6, Coffee → 3, "boba" → 2 |
| Cart → checkout → receipt | Pass, cart clears after sale |
| Low stock | Paper Filters, Chocolate Chip Cookie, Pour-Over Carafe, Lemon Juice all flagged |
| Console errors | None |

Also confirmed by DOM assertion that the empty-cart **Charge** button is truly
`disabled` — the screenshot renders it deceptively solid.

### 2026-10-17 — Milestone 2: routing review + POS + Admin overview

**Routing review (10 findings, all fixed)**

The routing and dashboards were reviewed before writing new screens. Two were
real bugs, the rest were quality gaps:

1. **Cashier saw admin content flash.** The layout redirected in an effect but
   still rendered `children`, so a forbidden page painted for one frame before
   the redirect fired. The gate now blocks rendering too.
2. **Hard page loads bounced signed-in users to `/login`.** Zustand rehydration
   is asynchronous, so on a fresh document the store read as `session: null`,
   the guard fired `redirect("/login")`, and the login screen then bounced back
   to the dashboard. Client-side navigation worked, which is why the first
   round of tests missed it entirely.
   Fixed with `skipHydration: true` plus an explicit rehydrate effect and a
   `hydrated` flag that every auth decision waits on. Deferring rehydration
   also keeps the server markup and first client render identical, so there is
   no hydration mismatch.
3. **Route matching was exact-string only.** `isAdminOnly` compared against
   `/dashboard/pos` literally, so adding `/dashboard/pos/orders/42` later would
   have blocked cashiers from their own POS. Replaced with prefix matching.
4. **Mobile tab labels were truncated garbage** — `"Point of Sale".split(" ")[0]`
   rendered as "Point". Added an explicit `shortLabel` field.
5. **No error boundary.** A throw inside the dashboard fell through to Next's
   unstyled default. Added `dashboard/error.tsx` with retry and a digest
   reference.
6. **No 404 page.** Added a styled `not-found.tsx`.
7. **Header showed no page context.** Now names the current page and describes
   it, sourced from the same nav config as the sidebar.
8. **`/` caused a double redirect** for signed-in users (to `/login`, then on to
   the dashboard), flashing the login screen. Now redirects straight to the
   role's home.
9. **Missing `aria-label` on navigation landmarks** in sidebar and mobile nav.
10. **`/favicon.ico` returned 404.** Generated `src/app/favicon.ico` from the
     brand mark and removed the metadata icon override, which had pointed at the
     full 500×500 logo card.

**Access control**

New `src/lib/access.ts` is the single source of truth for permissions, active
state, and page titles, consumed by the layout guard, sidebar, mobile nav, and
header. `/dashboard` matches only exactly so it cannot swallow its children;
every other entry matches the exact path or anything nested beneath it.
Unlisted routes under `/dashboard` are admin-only, so new screens can ship
without touching the nav config while cashiers stay restricted.

**Domain model** — `src/types/pos.ts`

Products carry `stockMode: "recipe" | "direct"`, which is the "both" decision
from the plan: recipe items decrement ingredients, direct items decrement
themselves. `minStock` is deliberately a **reorder alert threshold, not a sell
block** — verified in the browser that nothing is blocked by it.

**Mock services** — `reference.ts`, `products.ts`, `orders.ts`, `dashboard.ts`

18 products across 4 categories, 10 ingredients, and a week of seeded order
history (deterministic PRNG, weekend-weighted) so the dashboard has real
numbers to aggregate.

**POS screen**

Product grid with search and category chips, live cart with quantity steppers,
subtotal/PPN/total, and a checkout dialog covering cash (with quick-tender
buttons and live change calculation), QRIS, debit, and credit. Completing a sale
issues an 80mm receipt. The checkout body only mounts while the dialog is open,
so each sale starts with clean state instead of resetting it from an effect.

**Admin Overview**

Revenue today, average order, items sold, low-stock count, a 7-day revenue trend,
payment mix with share of the day, recent transactions, and a low-stock list that
spans both ingredients and direct-stock products.

**Data fix**

Butter Croissant, Bottled Water, and Soft Drink Can were modelled as both
ingredients *and* direct-stock products with identical numbers, which would have
double-counted them on the inventory screen. Removed from the ingredient list
and kept only as direct products; the low-stock list now aggregates both kinds.

**Verification**

`typecheck`, `lint`, and `build` all exit 0. A 27-check Playwright pass against
the production build:

| Check | Result |
|---|---|
| Admin reaches all 6 routes (hard load) | Pass |
| Cashier blocked from all 5 admin routes | Pass |
| Cashier sees 1 nav item, admin sees 6 | Pass |
| Header title follows route | Pass |
| Unknown route renders styled 404 | Pass |
| POS grid renders, cart accumulates | Pass |
| Checkout blocks underpayment, computes change | Pass |
| Receipt issued, cart cleared | Pass |
| Mobile tab labels | `Home, POS, Products, Stock, Reports, Users` |
| Console errors | None (only the deliberate 404) |

Three assertions failed on the first run and **all three were bad tests, not
app bugs**: the KPI label is uppercased by CSS so `textContent` is
"Revenue today"; and `minStock` should not disable tiles. Corrected.

### 2026-10-17 — Milestone 1: toolchain + login

**Toolchain**
- Bootstrapped Next.js 16.4.2 / TypeScript 5.9.3 / Tailwind 4.3.3 / shadcn 4.22.0.
  Previously the repo had folder stubs but no Next.js, no TypeScript config,
  and no `react` in `package.json`.
- Pinned TypeScript to 5.9.3 rather than the newly released 7.0.2, and ESLint to
  9.x rather than 10 — both too new for Next 16 at time of writing.
- Replaced the `FlatCompat` ESLint bridge with `eslint-config-next`'s native flat
  config exports; the bridge crashed with `Converting circular structure to JSON`.
- Added `class-variance-authority`, which `shadcn add` did not pull in because
  `components.json` was written by hand.
- Switched react-hook-form `watch()` to `useWatch()` to satisfy the React
  Compiler, which Next 16 enables by default.

**Design system**
- Added brand tokens to `globals.css`, mapped through `@theme inline`, with light
  and dark blocks.
- Copied `asset/logo/moka-logo.svg` to `public/brand/`. Source file untouched.
- Authored `public/brand/moka-mark.svg`, an icon-only version of the logo mark.
  The original is a full card with wordmark and tagline, which `object-cover`
  cropped into an unrecognisable blob at 40px.

**Auth + login**
- `types/auth.ts` — `Role`, `User`, `Session`, plus `ROLE_LABEL` and `ROLE_HOME`
  for role-aware labels and redirects.
- `services/users.ts` — mock adapter with three seeded users. Returns typed
  failure reasons (`invalid`, `role-mismatch`, `inactive`) rather than a bare
  boolean, so the UI can show a specific message.
- `store/useAuthStore.ts` — Zustand store persisted to `localStorage`.
- `app/(auth)/login/page.tsx` + `components/auth/LoginForm.tsx` — zod-validated
  form, show/hide password, inline field errors, `role="alert"` for auth
  failures, 600 ms simulated latency, click-to-fill demo accounts.
- `components/auth/RolePicker.tsx` — two-card radio group, keyboard operable,
  wrapped in a `fieldset`/`legend`.
- `components/brand/BrandPanel.tsx` — split-screen gradient panel, hidden below
  `lg`.
- Role-aware redirect on success: cashier → `/dashboard/pos`, admin → `/dashboard`.

**App shell**
- `dashboard/layout.tsx` — auth guard plus role guard. A cashier hitting any
  route other than POS is redirected to POS.
- `Sidebar` (desktop), `Header` (user + sign out), `MobileSidebar` (slide-in drawer).
- `lib/nav.ts` — single source of truth for role-to-route permissions.
- Six empty page stubs replaced with `PagePlaceholder` so every route compiles.
  These are placeholders, not features.

**Verification**
`typecheck`, `lint`, and `build` all exit 0. A Playwright pass against the
production build confirmed:

| Check | Result |
|---|---|
| Wrong password | Shows "Incorrect username or password." |
| Cashier role + admin credentials | Shows role-mismatch error |
| Demo autofill | Fills the clicked account |
| Admin sign-in | Lands on `/dashboard`, sees all 6 nav items |
| Session across reload | Stays signed in |
| Sign out | Returns to `/login` |
| Cashier sign-in | Lands on `/dashboard/pos`, sees 1 nav item |
| Cashier opens `/dashboard/users` | Bounced to `/dashboard/pos` |
| Console errors | None |

### Known gaps and deliberate omissions

- **MFA recovery is admin-mediated.** An admin can reset another account's
  authenticator from User management, and an operator can run
  `npm run mfa:reset -- <username>` in `backend/` when the only admin is locked
  out. There is no self-service "disable 2FA" screen.
- **Recovery codes are shown once, by design.** The setup screen now offers
  copy, download, and print, and blocks Continue until the admin acknowledges
  they saved the codes; the tab-close warning is a last resort. A signed-in
  admin can also see how many codes remain and regenerate the set from
  **Security** (`/dashboard/security`) by confirming their password and a live
  authenticator code. If every code is lost, resetting MFA is still the only
  way back.
- **Frontend unit tests cover pure functions, not components.** The four Vitest
  files exercise read models and the cart store; screens still rely on the
  browser smoke suites.
- **Menu prices and ingredient costs are placeholders.** `PLACEHOLDER_PRICES` in
  `src/lib/repositories/mock/seed.ts` and the same constant in
  `backend/src/seed.ts` mark them; the costs beside them need real supplier
  invoices before the margin figures mean anything.
- The seeded order history is uniform random, so it puts implausible numbers on
  the report — 20 pour-over carafes in a week. It exists to give the aggregates
  something to chew on, not to forecast demand.
- **Dark mode is defined in CSS but has no toggle.**
- **Sessions need HTTPS in production.** `COOKIE_SECURE` defaults to `false` for
  local http development and must be `true` behind TLS.
- If the artwork in `asset/menu/` is ever re-exported, re-run the strip: the
  served copies in `public/menu/` are generated, not hand-edited.
- Playwright browsers are not version-pinned; a fresh clone needs
  `npx playwright install chromium` before `npm run smoke` will run.