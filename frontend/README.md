# Moka Cafe POS

Point of sale for Moka Cafe. Frontend-first build in Next.js + TypeScript, with
Express and MongoDB deferred until the UI is proven.

> **This README is the living changelog.** Every update gets an entry in
> [Changelog](#changelog) — append newest first, never rewrite history.

> **Looking for the requirements docs?** See [`docs/`](./docs/README.md) — PRD,
> TRD, API contract, testing, and design system.

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
| Product management | **Done** — CRUD, recipe editor, categories, archive |
| Stock management | **Done** — levels, adjustments, movement ledger |
| Reports | **Done** — date range, period comparison, CSV export |
| User management | **Done** — create, role, activate/deactivate |
| Selling moves stock | **Done** — recipes and counted items, with ledger |
| Interface guidelines | **Done** — touch targets, reduced motion, print, URL state |
| Shift open / close | Records only — no POS gate, no cash reconciliation |
| Express + MongoDB | Not started — see [What we can build next](#what-we-can-build-next) |

Frontend is complete and self-contained: no API routes, no server code, no
server dependencies. The backend has a written contract to implement.

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
| Verification | Playwright smoke scripts | 1.64.1 |

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
| `npm run smoke` | All browser smoke suites (needs a running server) |

### Verification

`scripts/` holds Playwright suites that drive the real UI against a production
build. They are the reason the bugs listed in the Milestone 3 changelog were
caught, so they are worth running after any change to the data layer.

```bash
npm run build
npm run start          # in one terminal
npm run smoke          # in another
```

| Suite | Covers |
|---|---|
| `smoke:products` | catalogue CRUD, filters, sorting, archive, role gate |
| `smoke:stock` | adjustments, refusal of over-withdrawal, ledger, a sale moving stock |
| `smoke:reports` | ranges, presets, empty periods, CSV contents, role gate |
| `smoke:users` | create, duplicate rejection, sign-in, deactivation, last-admin guard |
| `smoke:journey` | one sale followed through till, dashboard, ledger, and report |
| `smoke:a11y` | document metadata, skip link, reduced motion, URL state, print geometry |
| `smoke:screens` | acceptance pass over all seven requested screens |

They use a fixed set of demo credentials and reset nothing: each script signs in,
changes data, and leaves it.

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
      page.tsx             Overview
      pos/                 Point of Sale
      products/            Product management
      inventory/           Stock management
      reports/             Reports
      users/               User management
  components/
    ui/                    shadcn primitives
    auth/                  LoginForm, RolePicker
    brand/                 BrandPanel
    layout/                Sidebar, Header, MobileNav
    common/                PagePlaceholder
    dashboard/             StatCard, OverviewWidgets, AdminOverview
    pos/                   PosScreen, ProductGrid, CartPanel,
                           CheckoutDialog, ReceiptModal
    products/              ProductsScreen, ProductFormDialog,
                           CategoryManagerDialog
    stock/                 StockScreen, StockAdjustDialog
    reports/               ReportsScreen
    users/                 UsersScreen, UserFormDialog
    DataTable, FilterBar, ConfirmDialog, PageHeader
  hooks/
    useAsync.ts            One data-loading hook for every screen
    useDebouncedValue.ts   Trailing value for search boxes
  lib/
    utils.ts               cn()
    format.ts              IDR currency, dates
    csv.ts                 Quoted CSV export
    auth.ts                StoredUser -> User, the only password boundary
    demo.ts                Demo accounts shown on the login screen
    access.ts              canAccess / matchNavItem (route guard source of truth)
    nav.ts                 Navigation config + role permissions
    repositories/
      types.ts             The interfaces every screen codes against
      index.ts             getRepositories() — the swap point
      read-models.ts       Dashboard and report aggregations
      mock/                Implementation backed by localStorage
        db.ts              Versioned document, atomic read-modify-write
        seed.ts            Fixtures and 30 days of order history
        helpers.ts         Latency, slug, id uniqueness
        categories.ts  ingredients.ts  products.ts
        stock.ts           The only writer of stock numbers
        orders.ts          Order writes + stock consumption, one transaction
        users.ts           Accounts and credential checks
        shifts.ts          Shift records (not yet gated on selling)
  store/
    useAuthStore.ts        Session, persisted to localStorage
    useCartStore.ts        POS cart
  types/
    auth.ts                Role, User, StoredUser, login messages
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
returns seven repository objects declared in `lib/repositories/types.ts`. The only
file naming an implementation is `lib/repositories/index.ts`, so when Express
exists the swap is seven imports rather than a rewrite. Every method is already
async, which is what makes that true — a mock that answered synchronously would
have forced every call site to change shape later.

**One writer for stock, and one transaction per sale.** `mock/stock.ts` is the
only module that assigns to `ingredient.stock` or `product.stock`, so the
movement ledger cannot drift from the levels it claims to explain. A completed
sale writes the order, decrements stock, and appends ledger rows inside a single
`mutate`, which snapshots and restores on failure: a stock shortfall leaves no
receipt and no partial movement.

**Aggregations live in read models, not in screens.** The dashboard and reports
both need the same sums, and a screen-local copy of that arithmetic would drift
from the other screen's figures.

**No new dependencies for the admin UI.** `radix-ui` already ships select,
switch, alert-dialog, dropdown-menu, and popover, so the shadcn components are
written directly against it rather than fetched by the CLI. Radix has no table
primitive, so `DataTable` is plain markup with client sorting and pagination —
the mock returns everything at once, so server-driven paging would be architecture
for a problem this app does not have yet.

**Passwords have one boundary.** `StoredUser` exists only inside the auth
repository; `lib/auth.ts` converts it to `User`, which has no credential field.
There is no path for a password to reach a component or the persisted session.

**Role gating is enforced twice.** The sidebar only renders links a role can
use, *and* `dashboard/layout.tsx` blocks rendering and redirects for any route
the role cannot reach. The nav hiding alone is not a security boundary once
Express exists.

**Auth decisions wait on `hydrated`.** Persisted state is read in an effect
rather than during store creation, so guards never see a signed-in user as
signed out mid-load. See changelog finding 2.

**Sessions live in `localStorage` under `moka-pos.auth`.** Fine for a mock.
Before production, sessions must move server-side (HTTP-only cookie or a real
token) — a `localStorage` session is readable by any script on the page. The
mock database also lives in `localStorage`, which is a development convenience
and nothing more.

**`minStock` is a reorder threshold, not a sell block.** Items stay sellable down
to zero; crossing `minStock` raises an admin alert. Change this only if the cafe
wants to hard-stop selling.

**Nothing is hard-deleted.** Products archive, users deactivate. Sales reference
both by id, and deleting either would leave historical totals unresolvable.

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
clears WCAG AA contrast. A `.dark` block is defined but not yet reachable in the
UI.

---

## What we can build next

The frontend is complete and self-contained, so the roadmap is mostly "what a
server unlocks" and "what the cafe will inevitably ask for". Ordered by what
earns its keep first.

### 1. Express + MongoDB — the real unlock

The contract is already written. `src/lib/repositories/types.ts` declares seven
interfaces, every method async, which is what makes them implementable over HTTP
without touching a screen:

| Interface | Methods |
|---|---|
| `CategoryRepository` | list, create, update, remove, reorder |
| `IngredientRepository` | list, getById, create, update |
| `ProductRepository` | list, getById, create, update, setActive, archive |
| `StockRepository` | movements, adjust, levelOf, value |
| `UserRepository` | list, create, update, setActive, authenticate |
| `OrderRepository` | list, getById, recent, create |
| `ShiftRepository` | current, list, open, close |

Six input DTOs (`CategoryInput`, `IngredientInput`, `ProductInput`,
`StockAdjustInput`, `UserInput`, `CreateOrderInput`) are the request bodies, and
`src/types/pos.ts` plus `src/types/auth.ts` are the response shapes. Suggested
collections: `users`, `categories`, `ingredients`, `products` (recipe embedded),
`orders` (lines embedded, so a receipt never needs a join), `stock_movements`,
`shifts`.

What the mock genuinely cannot do, and what a server fixes:

- **Two tills at once.** The store is per-browser `localStorage`, so two
  cashiers are two unrelated datasets.
- **Durability.** Clearing site data erases the whole business.
- **Real enforcement.** Role checks are client-side today. Hiding a nav item is
  not authorisation; the server must re-check on every route.
- **Race safety.** Two tills selling the last pastry can both pass the stock
  check. A Mongo transaction makes the decrement and the sale one atomic write —
  the same guarantee `mock/stock.ts` gives today with its snapshot-and-restore.

Then: httpOnly-cookie sessions in place of the `localStorage` session, and a
server-side guard so `/dashboard/users` refuses a cashier even without the UI.

### 2. Features the frontend already has a seam for

These are not rewrites; each is a screen on top of something that exists.

- **Shift gating.** `shiftRepository` records shifts and `Shift` is fully typed,
  but the POS does not require an open shift. Blocking checkout with no open
  shift is one condition in `CheckoutDialog`.
- **Cash reconciliation.** `Shift.close` already takes a counted float; nothing
  compares it against cash sales inside the shift. An X-report closes the gap.
- **Receipt reprint.** `OrderRepository.getById` exists and no screen calls it —
  it is what a receipt reprint button and an order-history screen need.
- **Cashier home view.** Cashiers currently land straight on the POS. A
  "my shift today" view would use `OrderRepository.list({ cashierId })`.

### 3. What the cafe will ask for

Roughly in the order it comes up.

- **Real prices and supplier costs.** `costPerUnit` is rupiah per ml/gram now but
  the numbers are invented. Supplier invoices make margin, COGS, and gross
  profit real — and `ProductFormDialog` already shows cost, margin, and gross per
  cup, so the UI needs no change.
- **Discounts and promotions.** No concept exists. Needs a line-level or
  order-level adjustment, a reason code, and a place in the ledger.
- **Split bills and table service.** Orders are currently one payment. Tab or
  table grouping means an order can settle in parts.
- **Product photo upload.** Products pick from the 20 fixed illustrations in
  `public/menu/`. Real uploads need a storage decision — S3 or local disk served
  by Express.
- **Kitchen display / order queue.** The till prints the order; a second screen
  showing what is outstanding is mostly front-end plus a socket.

### 4. Hardening worth doing at some point

- **Unit tests.** Only browser smoke suites exist (154 checks, all end-to-end).
  The aggregation and stock rules in `read-models.ts` and `types/pos.ts` are
  pure functions and are where unit tests pay off most.
- **CI.** `typecheck`, `lint`, `build`, and `npm run smoke` are all scripted and
  ready to run in GitHub Actions on every push. Nothing wires them up yet.
- **Dark mode.** The palette and tokens exist; only the toggle is missing.
- **PWA.** `appleWebApp` metadata is already set. An offline-capable installable
  build would suit a till with flaky wifi.
- **Indonesian copy.** The copy and the dates are English; the currency,
  number grouping, and the `PPN` tax acronym stay Indonesian, which is correct
  for the setting. Translating the UI would be a copy pass, not a refactor —
  but `<html lang>` and the date locale would have to move with it, and
  `smoke:a11y` asserts `lang`.

### 5. Worth deciding before writing the API

1. **Session strategy** — httpOnly cookie (recommended, survives XSS) versus a
   token in memory (needs an interceptor in every axios call).
2. **Whether shift gating ships with v1** — it changes the POS's opening
   behaviour, so retrofitting it later touches a screen that is already busy.
3. **Whether roles stay fixed at two.** The code assumes `admin | kasir`
   everywhere; a third role means widening `Role` and re-checking `lib/nav.ts`.
4. **Image storage** — decides whether Express serves files or presigned URLs do.

---

## Changelog

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

- `<html lang="en">`, matching the English copy and dates. It follows the words,
  not the money: the currency is Indonesian but no string a screen reader reads
  is, so `id` would read English copy with Indonesian phonetics.
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

- **Shift open / close is not built.** `shiftRepository` records shifts, and the
  reports read orders rather than shifts, but the POS does not require an open
  shift before selling. That gate is the next thing to add.
- **No cash reconciliation.** Shift close records a counted float, but nothing
  compares it against the cash sales inside the shift yet.
- Express, MongoDB, and real authentication do not exist. The repository
  interfaces are the seam they slot into.
- `localStorage` sessions are unsuitable for production; see Architecture. The
  mock database lives there too, so a browser's data can be wiped by clearing
  site data.
- **Menu prices and ingredient costs are placeholders.** `PLACEHOLDER_PRICES` in
  `src/lib/repositories/mock/seed.ts` marks the prices; the costs beside them
  need real supplier invoices before the margin figures mean anything.
- The seeded order history is uniform random, so it puts implausible numbers on
  the report — 20 pour-over carafes in a week. It exists to give the aggregates
  something to chew on, not to forecast demand.
- If the artwork in `asset/menu/` is ever re-exported, re-run the strip: the
  served copies in `public/menu/` are generated, not hand-edited.
- Dark mode is defined in CSS but has no toggle.
- Playwright browsers are not version-pinned; a fresh clone needs
  `npx playwright install chromium` before `npm run smoke` will run.