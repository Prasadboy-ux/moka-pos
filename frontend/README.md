# Moka Cafe POS

Point of sale for Moka Cafe. Frontend-first build in Next.js + TypeScript, with
Express and MongoDB deferred until the UI is proven.

> **This README is the living changelog.** Every update gets an entry in
> [Changelog](#changelog) — append newest first, never rewrite history.

---

## Status

| Area | State |
|---|---|
| Toolchain | Done — Next 16, TypeScript strict, Tailwind v4, shadcn/ui |
| Design system | Done — brand tokens from logo palette |
| Login (Kasir / Admin) | **Done** |
| App shell + role routing | **Done** |
| POS + checkout + receipt | **Done** — cash, QRIS, debit, credit, PPN |
| Menu illustrations | **Done** — 20 illustrated items |
| Admin Overview dashboard | **Done** — KPIs, trend, payment mix, low stock |
| Shift open / close | Planned — Milestone 3 |
| Products / Inventory / Reports / Users | Planned — Milestone 3 |
| Express + MongoDB | Not started |

## Tech stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.4.2 |
| Language | TypeScript (`strict`, `noUncheckedIndexedAccess`) | 5.9.3 |
| UI | React | 19.3.1 |
| Styling | Tailwind CSS (CSS-first config) | 4.3.3 |
| Components | shadcn/ui (`new-york` style) | 4.22.0 |
| Forms | react-hook-form + zod | 7.90.0 / 4.6.7 |
| State | Zustand (auth, cart) | 5.0.15 |
| Icons | lucide-react | 1.59.0 |
| Validation | ESLint 9 flat config | 9.39.5 |

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Demo accounts

| Role | Username | Password | Lands on |
|---|---|---|---|
| Admin | `admin` | `admin123` | `/dashboard` |
| Cashier | `kasir` | `kasir123` | `/dashboard/pos` |

The login screen lists these as click-to-fill buttons.

## Project structure

```
src/
  app/
    (auth)/login/          Login screen
    dashboard/             Admin area (role-gated layout)
      layout.tsx           Shell + auth/role guard
      page.tsx             Overview          (placeholder)
      pos/                 Point of Sale      (placeholder)
      products/            Product management (placeholder)
      inventory/           Stock management   (placeholder)
      reports/             Reports            (placeholder)
      users/               User management    (placeholder)
  components/
    ui/                    shadcn primitives
    auth/                  LoginForm, RolePicker
    brand/                 BrandPanel
    layout/                Sidebar, Header, MobileNav
    common/                PagePlaceholder
    dashboard/             StatCard, OverviewWidgets, AdminOverview
    pos/                   PosScreen, ProductGrid, CartPanel,
                           CheckoutDialog, ReceiptModal
  lib/
    utils.ts               cn()
    format.ts              IDR currency, dates
    nav.ts                 Navigation config + role permissions
    access.ts              canAccess / matchNavItem (route guard source of truth)
  services/
    reference.ts           Categories + ingredients fixtures
    products.ts            Mock catalogue adapter (20 illustrated items)
    orders.ts              Mock order store, seeded history
    dashboard.ts           Dashboard read models
    users.ts               Mock auth adapter
  store/
    useAuthStore.ts        Session, persisted to localStorage
    useCartStore.ts        POS cart
  types/
    auth.ts                Role, User, Session
    pos.ts                 Product, Order, Ingredient, Shift, stock rules
asset/menu/                SOURCE artwork, 20 SVGs, labels intact
public/menu/               Served artwork, 20 SVGs, labels stripped
public/brand/
  moka-logo.svg            Full logo card (mark + wordmark + tagline)
  moka-mark.svg            Icon-only mark for small UI slots
src/app/favicon.ico        Generated from the brand mark
```

## Architecture decisions

**Service layer, not stores, holds the data.** Screens call
`src/services/*.ts`. Those files currently return mock data; when Express is
ready only those files change to axios calls, and no screen is touched. This is
why `axios` was kept in `package.json` from the start.

**Role gating is enforced twice.** The sidebar only renders links a role can
use, *and* `dashboard/layout.tsx` blocks rendering and redirects for any route
the role cannot reach. The nav hiding alone is not a security boundary once
Express exists.

**Auth decisions wait on `hydrated`.** Persisted state is read in an effect
rather than during store creation, so guards never see a signed-in user as
signed out mid-load. See changelog finding 2.

**Sessions live in `localStorage` under `moka-pos.auth`.** Fine for a mock.
Before production, sessions must move server-side (HTTP-only cookie or a real
token) — a `localStorage` session is readable by any script on the page.

**`minStock` is a reorder threshold, not a sell block.** Items stay sellable down
to zero; crossing `minStock` raises an admin alert. Change this only if the cafe
wants to hard-stop selling.

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

`--primary` is the logo cyan darkened slightly so white text on top of it
clears WCAG AA contrast. A `.dark` block is defined but not yet reachable in
the UI.

---

## Changelog

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
- `Sidebar` (desktop), `Header` (user + sign out), `MobileNav` (bottom tabs).
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

- **Not a git repository.** No commits yet. Worth initialising before Milestone 3.
- `playwright` was installed as a dev dependency for the verification pass; no
  test suite is committed.
- Shift open / close is not built. The POS does not yet require an open shift
  before selling — that gate is planned for Milestone 3.
- **Selling does not yet decrement stock.** The UI disables tiles when stock is
  genuinely insufficient, but a completed order does not write a
  `StockMovement` or reduce ingredient levels. That is the first thing to add
  when the data layer becomes real, otherwise the seeded numbers never move.
- Products, Inventory, Reports, and Users remain placeholders.
- **Menu prices are placeholders.** `PLACEHOLDER_PRICES` in
  `src/services/products.ts` marks the block.
- If the artwork in `asset/menu/` is ever re-exported, re-run the strip: the
  served copies in `public/menu/` are generated, not hand-edited.
- Express, MongoDB, and real authentication do not exist.
- `localStorage` sessions are unsuitable for production; see Architecture.
- Dark mode is defined in CSS but has no toggle.
- Matcha Latte has no matcha ingredient in its recipe — placeholder data only.