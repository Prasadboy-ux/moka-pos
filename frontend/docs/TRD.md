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
| Animation | `tw-animate-css` | ^1.4.0 | Entry/exit keyframes for Radix overlays |
| Components | shadcn/ui, `new-york` style | — | Source in `components/ui`, not a dependency |
| Primitive lib | `radix-ui` (unified) | ^1.8.1 | Ships every primitive the app uses |
| Icons | `lucide-react` | ^1.59.0 | Tree-shaken, one package |
| Forms | react-hook-form + zod | ^7.90.0 / ^4.6.7 | `zodResolver`; schemas colocated with forms |
| Client state | zustand | ^5.0.15 | Two stores only: auth session, POS cart |
| HTTP | axios | ^1.20.0 | Installed, **zero usages** — the prepared seam for Express |
| Lint | ESLint flat config | ^9.39.5 | `eslint-config-next`, native flat exports |
| Verification | Playwright | ^1.64.1 | Smoke suites against the production build |

Node `>= 20.9` is required by Next 16.

## 2. The central constraint

**No backend exists.** The app is complete and runs entirely in the browser, but
every byte of data lives in `localStorage`.

That forced one architectural decision, and everything else follows from it.

### The repository seam

Screens depend on interfaces, never on a data source.

```
src/lib/repositories/
  types.ts       Seven interfaces + six input DTOs. The contract.
  index.ts       getRepositories(). The ONLY file naming an implementation.
  read-models.ts Dashboard and report aggregations (pure functions).
  mock/          Implementation, backed by a versioned localStorage document.
```

`getRepositories()` returns a frozen singleton of seven repository objects. When
the Express API arrives, **the seven imports in `index.ts` change and no screen
does.** Every method is already `async`, so callers are written for a network
round trip rather than for a synchronous object read.

The `mock/` directory keeps the same discipline internally:

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
The backend should mirror them.

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
Shift       { id, userId, userName, openedAt, openingFloat, closedAt, closingCounted, status }
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

`mock/stock.ts` is the only module that assigns to `ingredient.stock` or
`product.stock`. Everything else routes through it. That is what makes the
movement ledger a complete history rather than a log that can quietly fall out of
step with the numbers it claims to explain.

### Sale atomicity

`orderRepository.create()` writes the order, consumes stock, and appends ledger
rows inside a single `mutate`. `mutate` snapshots the document first and restores
it if the callback throws, so a stock shortfall leaves **no receipt, no
movement, and no partial state**. The same guarantee must come from a MongoDB
transaction.

## 5. Shared hooks

| Hook | Why it exists |
|---|---|
| `useAsync(loader, deps)` | The only data-loading hook. Sets state **only from promise callbacks** and derives `isLoading` rather than toggling it, which is what the React compiler's `set-state-in-effect` rule asks for. Guards against state set after unmount and against a late response from a superseded run. |
| `useDebouncedValue(value, ms)` | Keeps search keystrokes out of filters and navigations. |
| `useQueryState()` | Query parameters as state. `replace` not `push`, so a filter change does not stack history. Search is written on a debounce. |

## 6. Shared components

| Component | Role |
|---|---|
| `DataTable` | Sortable columns, client pagination, skeleton and empty states |
| `FilterBar` | Search with counted category chips |
| `ConfirmDialog` | Awaits the action, toasts failures, keeps the dialog open on failure |
| `PageHeader` | Title, description, one primary action |
| `ui/toast` | One polite live region; the no-op fallback means a missing provider can never break a screen |

21 shadcn primitives in `components/ui`, hand-authored against the installed
`radix-ui` rather than fetched by the CLI — no network, no lockfile churn.
`DataTable` is plain markup because Radix has no table primitive.

## 7. Routing and permissions

```
/                        redirect → role home, or /login
/login                   sign-in
/dashboard               AdminOverview
/dashboard/pos           PosScreen          (kasir + admin)
/dashboard/products      ProductsScreen     (admin)
/dashboard/inventory     StockScreen       (admin)
/dashboard/reports       ReportsScreen     (admin)
/dashboard/users         UsersScreen       (admin)
```

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

Every auth decision waits on a `hydrated` flag. Zustand rehydration is
asynchronous, so on a hard load the store reads empty; a guard that looked
immediately would bounce a signed-in user to `/login`.

## 8. Performance decisions

| Decision | Reason |
|---|---|
| Client-side sorting and pagination | The mock returns everything at once. Server-driven paging would be architecture for a problem this app does not have. It moves into the repository later, not into every screen. |
| No virtualisation | 20 menu tiles is well under the ~50-item threshold. |
| Menu art as plain `<img>` | `next/image` refuses SVG optimisation without `dangerouslyAllowSVG`; these are ~1 KB trusted local assets that gain nothing from rasterising. |
| No layout reads in render | No `getBoundingClientRect` / `offsetHeight` during render. |
| Aggregations memoised | Every screen memoises the arrays from `useAsync`, since a fresh `[]` each render would invalidate downstream memos. |

## 9. Accessibility baseline

Verified by `smoke:a11y` (22 checks), not just intended.

- Every icon-only button has `aria-label`; decorative icons are `aria-hidden`.
- Async feedback uses `role="alert"` or an `aria-live="polite"` region.
- `lang="id"` matches the copy, currency, and dates.
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

154 checks across 7 suites. See [`TESTING.md`](./TESTING.md).

Playwright browsers are not version-pinned; a fresh clone needs
`npx playwright install chromium`.

## 12. Frontend → backend plan

| Step | Change |
|---|---|
| 1 | Write the API against `docs/API-CONTRACT.md`. |
| 2 | Add an `http/` implementation of the seven repositories. |
| 3 | Point `getRepositories()` at it — **one file changes**. |
| 4 | Replace the `localStorage` session with an httpOnly cookie, and add a server-side route guard. |
| 5 | Re-run the suites. They should pass unchanged; that is the acceptance test for the swap. |

Step 5 is the real check on whether the seam held. If a screen needed editing,
the abstraction leaked somewhere it should not have.