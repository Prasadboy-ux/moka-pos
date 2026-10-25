# Moka Cafe POS — Technical Requirements

Frontend scope only. This document describes what exists today and how it is
built, so a change can be made without rediscovering the reasoning.

## 1. Stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Framework | Next.js, App Router | ^16.4.2 | File-system routing, nested layouts for the role guard |
| UI runtime | React | ^19.3.1 | Required by Next 16 |
| Language | TypeScript | ^5.9.3 | `strict` **and** `noUncheckedIndexedAccess` |
| Styling | Tailwind CSS, CSS-first | ^4.3.3 | `@theme inline` maps tokens to utilities; no `tailwind.config` |
| Animation | `motion` (Motion for React) | ^14.6.0 | Shared tokens in `lib/motion.ts`; overlay enter/exit via `AnimatePresence`, layout tweens via `layoutId` |
| Keyframes fallback | `tw-animate-css` | ^1.4.0 | Skeleton pulse and one-shot CSS cues only |
| Components | shadcn/ui, `new-york` style | — | Source in `components/ui`, not a dependency |
| Primitive lib | `radix-ui` (unified) | ^1.8.1 | Ships every primitive the app uses |
| Icons | `lucide-react` | ^1.59.0 | Tree-shaken, one package |
| Forms | react-hook-form + zod | ^7.90.0 / ^4.6.7 | `zodResolver`; schemas colocated with forms |
| Client state | zustand | ^5.0.15 | Two stores only: auth session, POS cart |
| HTTP | axios | ^1.20.0 | The live transport — `lib/repositories/http/` |
| Lint | ESLint flat config | ^9.39.5 | `eslint-config-next`, native flat exports |
| Verification | Playwright | ^1.64.1 | Smoke suites against the production build |

Node `>= 20.9` is required by Next 16.

## 2. The central constraint

**One implementation swap must be able to change where every byte of data comes
from.** That was designed for from the first milestone, and it is the reason the
move from `localStorage` to the Express API was a one-file change.

### The repository seam

Screens depend on interfaces, never on a data source.

```
src/lib/repositories/
  types.ts       Eight interfaces + six input DTOs. The contract.
  index.ts       getRepositories(). The ONLY file naming an implementation.
  read-models.ts Dashboard and report aggregations (pure functions).
  http/          LIVE implementation. client.ts + catalog.ts + commerce.ts.
  mock/          Offline fallback, backed by a versioned localStorage document.
```

`getRepositories()` returns a frozen singleton of eight repository objects.
Swapping implementations means changing the eight imports in `index.ts` and
nothing else — which is exactly what happened when the API landed. Every method
is `async`, so callers were written for a network round trip rather than for a
synchronous object read, and no call site changed shape.

The `mock/` directory is retained as a fallback for working on a screen without
a database running. It keeps the same discipline internally:

| Module | Owns |
|---|---|
| `db.ts` | The document, versioned reads, and an atomic read-modify-write |
| `seed.ts` | Fixtures: 4 categories, 10 ingredients, 20 products, 3 users, 30 days of orders |
| `categories.ts` `ingredients.ts` `products.ts` `users.ts` | CRUD for each |
| `stock.ts` | **The only writer of stock numbers** |
| `orders.ts` | Order writes plus stock consumption, one transaction |
| `shifts.ts` | Shift records |
| `helpers.ts` | Simulated latency, slug, id uniqueness |

`DB_VERSION` reseeds when the shape changes, so a schema change never needs a
migration for data that only ever existed in a browser.

**`localStorage` mirrors the store from the first read, not the first write.** A
fresh seed is written straight back as it is built. Persisting only on mutation
would leave storage empty for a session that merely browsed, so the persisted
document would disagree with what the screen is showing — and anything reaching
the data through storage rather than through a repository (a second tab, a test)
would read a store that does not exist yet.

## 3. Data model

`src/types/pos.ts` and `src/types/auth.ts` are the source of truth for shapes.
The backend mirrors them in Mongoose schemas.

### The live HTTP layer

| Module | Owns |
|---|---|
| `http/client.ts` | Lazy axios instance, `ApiError`, one `request()` choke point, error normalisation |
| `http/catalog.ts` | `category`, `ingredient`, `product`, `user` repositories |
| `http/commerce.ts` | `stock`, `order`, `shift`, and `session` repositories |

Four decisions in this layer are not obvious from the code alone:

- **The session is an httpOnly cookie**, so axios sends it with
  `withCredentials: true` and there is no interceptor and no `Authorization`
  header anywhere.
- **The client is lazy.** The axios instance is created behind a `Proxy` on first
  property access. Constructing it at module load threw on a missing
  `NEXT_PUBLIC_API_URL` and aborted the whole production build, even though the
  variable is needed by exactly one request.
- **`Idempotency-Key` is generated per `create()` call**, so a checkout resent on
  flaky cafe wifi replays the original order instead of minting a second receipt.
- **Identity is stripped from request bodies.** `actor` and `cashier` exist on the
  interfaces so the mock has a session to read; the HTTP layer deletes both before
  sending, because the server takes the actor from the cookie.

```
Category    { id, name, sortOrder }
Ingredient  { id, name, unit, stock, minStock, costPerUnit }
Product     { id, name, categoryId, price, image, stockMode, stock?, minStock?, recipe, isActive }
RecipeItem  { ingredientId, qty }
Order       { id, receiptNo, lines[], subtotal, taxRate, taxAmount, total,
              paymentMethod, paidAmount, changeAmount, cashierId, cashierName, createdAt }
OrderLine   { productId, name, price, qty, stockMode }
StockMovement { id, type, ingredientId|null, productId|null, label, qty, unit, note,
                createdAt, byUserId, byUserName }
Shift       { id, userId, userName, openedAt, openingFloat, closedAt, closingCounted,
              status, cashSales?, expectedCash?, variance? }
User        { id, name, username, role, isActive }
StoredUser  extends User with `password` — never leaves the auth repository
```

Enums: `Role` = `admin | kasir` · `Unit` = `gram | ml | pcs` ·
`StockMode` = `recipe | direct` · `PaymentMethod` = `cash | qris | debit | credit` ·
`MovementType` = `sale | purchase | adjustment | waste` ·
`ShiftStatus` = `open | closed`

Two modelling choices worth defending:

**`minStock` is an alert, not a block.** Items stay sellable to zero. A hard block
would refuse drinks the café would happily make, and the café decides that — not
the software.

**Order lines are denormalised.** A line stores the name, price, and stock mode
as they were when sold. A receipt printed in two years shows what was charged,
not today's price. This is also why a product can be deleted outright: nothing
downstream re-resolves the product to print or total a receipt. The single
caller that did resolve it live — the category split in reports — routes an
unknown product to **Uncategorised** so the totals still agree. Users are the
opposite case and are never deleted: an order stores only the cashier's id, so
losing the account would lose the name on the receipt.

## 4. Rules in code, not in components

Aggregation lives in `read-models.ts`; stock rules live in `types/pos.ts`. The
dashboard and the reports need the same arithmetic, and a screen-local copy
would drift from the figures on the other screen.

| Function | Purpose |
|---|---|
| `canFulfill(product, ingredients, qty)` | Can the POS sell this? Drives the disabled tile. |
| `maxServings(product, ingredients)` | Servings current stock covers, and which ingredient limits it. |
| `lowStockItems(products, ingredients)` | Everything at or below reorder, across both stock modes. |
| `summarise(orders)` | Revenue, transactions, average order, items sold. |
| `trend(orders, days)` | Revenue per day. |
| `categorySales / productSales / cashierSales` | Report splits. Resolved against the catalogue, since lines carry only product ids. |
| `getSalesReport(from, to)` | A range **plus the equivalent preceding range**, so every figure can carry a delta. |

### One writer for stock

On the server, `backend/src/modules/stock/` is the only place that writes
`ingredient.stock` or `product.stock`. Everything else routes through it. That is
what makes the movement ledger a complete history rather than a log that can
quietly fall out of step with the numbers it claims to explain.

In the mock fallback, the same role belongs to `mock/stock.ts`.

### Sale atomicity

`POST /api/orders` writes the order, consumes stock, and appends ledger rows in
**one MongoDB transaction**, with conditional `$inc` decrements. A stock shortfall
rolls the whole thing back: **no receipt, no movement, no partial state**. The
conditional decrement is what stops two tills from both selling the last pastry —
both would read the same level, and only one `$inc` would satisfy its guard.

The mock gives the same guarantee with a snapshot-and-restore `mutate`, which is
why the rule was testable before the server existed.

## 5. Shared hooks

| Hook | Why it exists |
|---|---|
| `useAsync(loader, deps)` | The only data-loading hook. Sets state **only from promise callbacks** and derives `isLoading` rather than toggling it, which is what the React compiler's `set-state-in-effect` rule asks for. Guards against state set after unmount and against a late response from a superseded run. |
| `useDebouncedValue(value, ms)` | Keeps search keystrokes out of filters and navigations. |
| `useQueryState()` | Query parameters as state. `replace` not `push`, so a filter change does not stack history. Search is written on a debounce. |

## 6. Shared components

| Component | Role |
|---|---|
| `DataTable` | Sortable columns (animated chevron), client pagination, staggered row entrance, skeleton and empty states |
| `FilterBar` | Search with counted category chips and whileTap feedback |
| `ConfirmDialog` | Awaits the action, toasts failures, keeps the dialog open on failure |
| `PageHeader` | Title, description, one primary action |
| `ui/toast` | One polite live region; the no-op fallback means a missing provider can never break a screen |
| `motion/*` | `MotionProvider` (`reducedMotion="user"`), `PageTransition`, `StaggerGroup`, `AnimatedNumber` (now takes a `format`), `SuccessCheck`, `FlyToCart` |
| `ui/overlay-motion` | `useControlledOpen` + open-context factory — the pattern every animated Radix overlay roots on |

22 shadcn primitives in `components/ui`, hand-authored against the installed
`radix-ui` rather than fetched by the CLI — no network, no lockfile churn.
`DataTable` is plain markup because Radix has no table primitive.

`dialog`, `alert-dialog`, `dropdown-menu`, and `select` own `open` through
`overlay-motion.tsx` and host their portal in an `AnimatePresence`, so overlays
animate out instead of disappearing. Stateful dialog bodies mount *through*
`DialogContent` (as children, never as a sibling conditional) so the exit
animation keeps the last content and each open starts fresh — see
`CheckoutDialog`, `ReceiptModal`, and `VoidOrderDialog`.

## 7. Routing and permissions

```
/                        redirect → role home, or /login
/login                   sign-in
/dashboard               AdminOverview                    (admin)
/dashboard/pos           PosScreen                        (kasir + admin)
/dashboard/transactions  TransactionsScreen               (kasir + admin)
/dashboard/products      ProductsScreen                   (admin)
/dashboard/inventory     StockScreen                      (admin)
/dashboard/reports       ReportsScreen                    (admin)
/dashboard/users         UsersScreen                      (admin)
```

Cashiers reach two screens, not one. Transactions is theirs because reprinting a
receipt and looking up a disputed sale happen at the counter.

`lib/nav.ts` is the single source of truth for role-to-route permissions.
`lib/access.ts` resolves a pathname to its nav entry and answers `canAccess`.

Two details that are easy to break:

- `/dashboard` matches **exactly**; every other entry also matches nested paths,
  so a future `/dashboard/pos/orders/42` still resolves to the POS entry.
- An unlisted route under `/dashboard` is admin-only. New screens ship without
  touching the nav config while cashiers stay restricted.

The layout guard **blocks rendering** rather than only redirecting — redirecting
alone paints the forbidden page for one frame, which flashes admin content to a
cashier.

Every auth decision waits on a `hydrated` flag. It used to mean "Zustand has
finished rehydrating from `localStorage`"; it now means "`GET /api/auth/me` has
answered". The reason is the same — a guard that looked before the session was
known would bounce a signed-in user to `/login` on a hard load.

**The client-side guard is presentation, not authorisation.** The check that
actually matters is `requireRole` in `backend/src/middleware/session.ts`, which
re-reads the user document on every request.

## 8. Performance decisions

| Decision | Reason |
|---|---|
| Client-side sorting and pagination | The API returns a whole range at once. Server-driven paging would be architecture for a problem this app does not have. It belongs in the repository, not in every screen. |
| No virtualisation | 20 menu tiles is well under the ~50-item threshold. |
| Menu art as plain `<img>` | `next/image` refuses SVG optimisation without `dangerouslyAllowSVG`; these are ~1 KB trusted local assets that gain nothing from rasterising. |
| No layout reads in render | No `getBoundingClientRect` / `offsetHeight` during render. |
| Aggregations memoised | Every screen memoises the arrays from `useAsync`, since a fresh `[]` each render would invalidate downstream memos. |

## 9. Accessibility baseline

Verified by `smoke:a11y` (22 checks), not just intended.

- Every icon-only button has `aria-label`; decorative icons are `aria-hidden`.
- Async feedback uses `role="alert"` or an `aria-live="polite"` region.
- `lang="en"` matches the copy and the dates. The currency, number grouping, and
  the `PPN` tax acronym stay Indonesian, which is correct for the setting — but
  `id` would make a screen reader pronounce English copy with Indonesian
  phonetics.
- A skip link to `#main`, verified as the first tab stop.
- `touch-action: manipulation` and `-webkit-tap-highlight-color: transparent` —
  no double-tap delay, no grey flash.
- `prefers-reduced-motion` collapses animation. Two are cancelled outright rather
  than sped up: the infinite skeleton pulse and the tile hover zoom.
- Touch targets: steppers 40 px, quick tender 44 px, Charge 48 px.
- `tabular-nums` on every money column. `Intl.NumberFormat` / `Intl.DateTimeFormat`
  everywhere — no hardcoded formats.
- `transition-[...]` with named properties; never `transition-all`.

## 10. Printing

A receipt must print alone. `window.print()` from the dialog would otherwise
print the POS grid, sidebar, and dialog chrome.

The print stylesheet in `globals.css` isolates `[data-receipt]` and re-declares it
at 80 mm. One trap, recorded because it cost three attempts:

> Tailwind v4 emits `translate-x-[-50%]` as the CSS **`translate` property**, not
> `transform`. `transform: none` does not cancel it, and the build strips a
> literal `translate: none` from the rule. Zero `--tw-translate-x` /
> `--tw-translate-y` instead — that survives minification.

Also: `position: static` on the dialog makes it flow to the end of the document
and print off the page. Keep it positioned. `smoke:a11y` asserts the measured
print geometry, not the stylesheet text, because the stylesheet can look right
and still print nothing.

## 11. Build and verification

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm run build
npm run start        # required before the smoke suites

npm run smoke        # all 7 suites, sequential
```

The smoke suites need the API up and seeded on `http://localhost:3001` as well —
five of the seven sign out over HTTP, because the session cookie is httpOnly and
the page cannot clear it.

187 checks across 7 suites, plus 18 Vitest unit tests. See
[`TESTING.md`](./TESTING.md).

Playwright browsers are not version-pinned; a fresh clone needs
`npx playwright install chromium`.

## 12. The frontend → backend swap

**Complete.** Recorded here because the plan was the acceptance test for the
architecture, and its outcome is the evidence that the seam held.

| Step | Change | Result |
|---|---|---|
| 1 | Write the API against `docs/API-CONTRACT.md`. | Done — 35 routes in `../backend` |
| 2 | Add an `http/` implementation of the eight repositories. | Done — 342 lines across 3 files |
| 3 | Point `getRepositories()` at it — **one file changes**. | Done — 27 lines in `index.ts` |
| 4 | Replace the `localStorage` session with an httpOnly cookie, and add a server-side route guard. | Done — `moka_session` + `requireRole` |
| 5 | Re-run the suites unchanged. | Done — they pass against the live API |

Step 5 is the real check on whether the seam held. No screen was edited, which
is the point: if a screen had needed editing, the abstraction would have leaked
somewhere it should not have. The one thing that did change shape was test
setup — the suites had to learn to sign out over HTTP.