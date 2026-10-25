# API Contract — what the frontend expects

The frontend codes against nine repository interfaces in
`src/lib/repositories/types.ts` — config plus eight data repositories. This
document is those interfaces expressed as HTTP, plus the rules the server must
enforce so behaviour does not change when the swap happens.

**This contract is implemented.** The API in
[`../../backend`](../../backend/README.md) was built against this document, and
`backend/test/contract.e2e.ts` asserts all 38 contract routes against it
**transcribed by hand** — so the test checks the contract rather than restating
the code. `/api/health` is operational and deliberately outside that count. The
frontend's `lib/repositories/index.ts` points at it, and the mock is retained
only as a fallback for working without a database running.

## 1. Conventions

- Base path `/api`. JSON in, JSON out. `snake_case` is avoided — the TypeScript
  shapes are `camelCase` and should be transmitted unchanged.
- All money is an integer number of rupiah. No floats, ever. `12000`, not
  `12_000.00`.
- All timestamps are ISO 8601 UTC strings (`2026-10-17T23:00:00.000Z`).
- All IDs are opaque strings. The mock uses prefixes (`u-1`, `p-iced-latte`,
  `mv-42`) for legibility while debugging; treat them as opaque.
- All list endpoints return arrays, newest-first where a natural order exists.

### Error envelope

Every non-2xx response:

```json
{ "error": "machine-readable-code", "message": "Human sentence for the UI" }
```

`error` is stable and switchable. `message` is shown to the user, so it must read
as a sentence with a next step where one exists — not "Invalid input".

| `error` | Status | Meaning |
|---|---|---|
| `unauthenticated` | 401 | No or expired session |
| `forbidden` | 403 | Authenticated but wrong role, or wrong resource owner |
| `not-found` | 404 | Unknown id |
| `validation` | 422 | Body failed a rule. Include `fields` for per-field errors. |
| `conflict` | 409 | Business rule refused it (see below) |
| `insufficient-stock` | 409 | The sale cannot be covered by current stock |
| `rate_limited` | 429 | Too many requests. See the rate-limit rules below. |
| `internal` | 5xx | Unhandled failure. `message` stays a sentence; no stack escapes. |

`409` carries a `reason` so the client can say something specific:

```json
{ "error": "conflict", "reason": "last-active-admin", "message": "This is the last active admin. Promote another account first." }
```

Reasons in use: `last-active-admin` · `category-in-use` · `already-open-shift` ·
`already-closed-shift` · `no-open-shift` · `username-taken` ·
`order-already-voided` · `idempotency-key-foreign`.

### Rate limits

Two limiters, both keyed by client IP and backed by the shared Mongo store, so
restarts and multi-instance serverless deploys share one counter instead of one
per cold start:

- The **login limiter** bounds credential stuffing — the only attack a POS with
  one public IP faces from outside. Tight window (`RATE_LIMIT_LOGIN_MAX`
  attempts per 15 minutes), distinct message: "Too many sign-in attempts. Please
  wait and try again."
- The **API limiter** is a crash valve against a runaway client (a stuck polling
  loop), not a quota: it wraps the whole `/api` surface with
  `RATE_LIMIT_API_MAX` requests per minute, set far above what a shop of
  tablets generates. Its message: "Too many requests. Please wait a moment and
  try again."

Both limiters are skipped when `NODE_ENV=test` unless
`RATE_LIMIT_TEST_ENABLED=true`, so the e2e suites stay pace-independent. A
refusal answers `429` in the same envelope shape with a `Retry-After` (seconds)
header, and the draft-8 `RateLimit` header is sent on every response:

```json
{ "error": "rate_limited", "message": "Too many requests. Please wait a moment and try again." }
```

### Security rules the server owns

These are the ones a client must never be trusted on:

1. **`actor` and `cashier` come from the session, not the body.** The frontend
   types carry `actor: { id, name }` and `cashier: { id, name }` so the mock needs
   no session. The API must ignore them and read the session user.
2. **Totals are computed server-side.** `subtotal`, `taxAmount`, `total`, and
   `changeAmount` are never accepted from the client.
3. **Role is re-checked on every route.** Hiding a nav link is not authorisation.
4. **Passwords are hashed** (bcrypt or argon2) and never returned. The response
   shape is `User`, which has no password field.
5. **Price on an order line is historical.** Store what was charged; a later
   price change must not rewrite old receipts.

## 2. Store config

`ConfigRepository`

### `GET /api/config` → `200`

```jsonc
{ "taxRate": 0.1, "storeTimezone": "Asia/Jakarta" }
```

Public: it holds no secrets, and the tax rate is printed on every receipt
anyway. The POS reads it before pricing a cart so the displayed total cannot
drift from what checkout charges, and so report day labels use the store's
calendar rather than the browser's. The server remains the authority at
checkout — this endpoint is for display, not trust.

## 3. Authentication

Recommended: **httpOnly cookie session**. It survives XSS better than a token in
`localStorage`, and requires no interceptor on every request. If a bearer token
is chosen instead, every screen that calls a repository needs the header attached —
the seam does not provide that for free.

### `POST /api/auth/login`

```jsonc
// request
{ "username": "admin", "password": "admin123", "role": "admin" }  // role optional
```

```jsonc
// 200 — sets the session cookie
{ "user": { "id": "u-1", "name": "Budi Santoso", "username": "admin", "role": "admin", "isActive": true } }
```

| Failure | Status | `reason` |
|---|---|---|
| Unknown username or wrong password | 401 | `invalid` |
| Account deactivated | 401 | `inactive` |
| `role` supplied and it contradicts the account | 403 | `role-mismatch` |

These three map exactly onto `LoginFailureReason` in `src/types/auth.ts`, and the
login screen already shows a distinct message for each. Keep them distinct.

Use the same message and status for `invalid` regardless of which half was
wrong, so usernames cannot be enumerated.

### `POST /api/auth/logout` → `204`, clears the cookie.

### `GET /api/auth/me` → `200 { user }` or `401`.

Replaces reading the persisted session from `localStorage`. Called once on app
load; every guard waits on it — the same reason the mock has a `hydrated` flag.

## 4. Categories

`CategoryRepository`

| Method | Endpoint |
|---|---|
| `list()` | `GET /api/categories` |
| `create(input)` | `POST /api/categories` → `201` |
| `update(id, input)` | `PUT /api/categories/:id` |
| `remove(id)` | `DELETE /api/categories/:id` → `204` |
| `reorder(orderedIds)` | `PUT /api/categories/order` |

```jsonc
CategoryInput  { name: string, sortOrder?: number }
Category       { id, name, sortOrder }
```

`reorder` body: `{ "ids": ["c-coffee", "c-snack", ...] }` — order is the display
order the POS grid and every filter use.

`remove` must refuse with `409 category-in-use` while any product still
references the category. The UI disables the button, but the server enforces it.

`list` is silently capped at **500 rows** (`CATEGORY_LIST_CAP`). A menu should
never approach that; the cap exists so naming drift cannot hand an unbounded
array to the category pickers.

## 5. Ingredients

`IngredientRepository`

| Method | Endpoint |
|---|---|
| `list()` | `GET /api/ingredients` |
| `getById(id)` | `GET /api/ingredients/:id` |
| `create(input)` | `POST /api/ingredients` → `201` |
| `update(id, input)` | `POST /api/ingredients/:id` → `PUT` |

```jsonc
IngredientInput { name, unit: "gram" | "ml" | "pcs", minStock: number, costPerUnit: number }
Ingredient      { id, name, unit, stock, minStock, costPerUnit }
```

**There is no delete.** An ingredient is removed from the menu by renaming it or
dropping it from recipes. Deleting one would orphan recipe rows. A new ingredient
starts at `stock: 0`; the first stock arrives as a `purchase` movement, so every
unit has a ledger entry.

`costPerUnit` is rupiah for **one** unit. This is the single easiest field to get
wrong: a 250 g bag at Rp 95,000 is `380` per gram, not `0.095`. The previous
mock had this wrong and every margin read as 100%.

`list` is silently capped at **2000 rows** (`INGREDIENT_LIST_CAP`) — an
inventory list, not a browse page. The picker UIs expect every ingredient, so
the cap is a runaway guard, not pagination.

## 6. Products

`ProductRepository`

| Method | Endpoint |
|---|---|
| `list(query)` | `GET /api/products?includeInactive&categoryId&search` |
| `getById(id)` | `GET /api/products/:id` |
| `create(input)` | `POST /api/products` → `201` |
| `update(id, input)` | `PUT /api/products/:id` |
| `setActive(id, isActive)` | `PATCH /api/products/:id/active` |
| `remove(id)` | `DELETE /api/products/:id` — `204` |

```jsonc
ProductInput {
  name: string
  categoryId: string
  price: number            // rupiah
  image: string            // public path, e.g. "/menu/coffee/iced_americano.svg"
  stockMode: "recipe" | "direct"
  stock?: number           // optional; defaults to 0 when direct
  minStock?: number        // optional; defaults to 0 when direct
  recipe: RecipeItem[]     // required and non-empty when recipe
  isActive: boolean
}
```

Query defaults: `includeInactive` false — only active products unless asked.
`list` is silently capped at **2000 rows** (`PRODUCT_LIST_CAP`) for the same
reason as categories and ingredients: bounded by construction, no pagination.

**The response is mode-specific.** A `direct` product always has numeric
`stock` and `minStock`; a `recipe` product has neither property at all (not
`null`, not `0`) and always has a non-empty `recipe`. A recipe product that
carries a stock level is one that can oversell while looking fine.

```jsonc
// direct
{ id, name, categoryId, price, image, stockMode: "direct",
  stock: 36, minStock: 24, recipe: [], isActive: true }

// recipe
{ id, name, categoryId, price, image, stockMode: "recipe",
  recipe: [{ ingredientId, qty }], isActive: true }
```

Server-side validation the client also enforces, so both fail the same way:

- `recipe` mode: at least one ingredient, and no duplicate `ingredientId`.
- `direct` mode: `stock` and `minStock` default to `0` when omitted.
- `recipe` is ignored (stored empty) in `direct` mode.
- Switching a direct product to recipe unsets `stock` and `minStock`; switching
  it back does not resurrect the old count.

**Product edits write stock in exactly one place.** `POST /api/products` is the
only edit path that accepts `stock`, and it treats the value as the *opening*
count: a non-zero direct product creates a `purchase` movement in the same
transaction, so every unit on hand has a ledger row. `PUT /api/products/:id`
never writes stock — a later count belongs to `POST /api/stock/adjust`, and
letting the product form overwrite it would break the audit trail. A zero-stock
create writes no movement. After creation, the only other writer is a sale.

`remove` is separate from `setActive` on purpose: `setActive` is the reversible
"not selling this today" state, and `remove` is the terminal one. They are not the
same action and the UI offers them as two items.

**Deleting a product does not rewrite history.** Order lines denormalise `name`,
`price`, and `stockMode` as sold, so a receipt for a deleted product still prints
what was actually charged and a reprint years later still matches. The server
must not rewrite order lines on delete.

The one caller that resolves products live is the **category split in reports**.
A deleted product must be attributed to an `Uncategorised` bucket there rather
than skipped, so the category table keeps agreeing with the revenue total above
it.

## 7. Stock

`StockRepository`

| Method | Endpoint |
|---|---|
| `movements(filter)` | `GET /api/stock/movements?type&ingredientId&productId&limit&offset` |
| `adjust(input)` | `POST /api/stock/adjust` → `201` |
| `levelOf(target, id)` | `GET /api/stock/level?target=ingredient&targetId=i-milk` |
| `value()` | `GET /api/stock/value` |

The ledger is the one list that grows with every sale, so it pages rather than
ships unbounded history. Newest first, answering:

```jsonc
{
  "data": [StockMovement, ...],   // at most `limit` rows
  "total": 1042,                   // rows matching the filter, not the page
  "limit": 200,                    // default 200, hard max 1000
  "offset": 0                      // depth; ≤ 10 000
}
```

The screen shows the newest page and says so when `total > data.length`; a
longer look-back goes through the type or ingredient/product filters.

```jsonc
// POST /api/stock/adjust
{
  "target": "ingredient" | "product",
  "targetId": "i-milk-fresh",
  "type": "purchase" | "waste" | "adjustment",   // never "sale"
  "qty": 1000,                                     // signed, whole number
  "note": "Delivery from supplier, invoice 2041"
}
// actor is taken from the session and ignored in the body
```

```jsonc
// 201
StockMovement {
  id, type, ingredientId | null, productId | null, label,
  qty,                            // signed: negative consumes
  unit | null, note, createdAt, byUserId, byUserName
}
```

Server rules:

- `type: "sale"` is **not accepted** here. Sales write their movements as part of
  `POST /api/orders`.
- The sign must agree with the reason: `purchase` needs `qty > 0`, `waste` needs
  `qty < 0`, and `adjustment` is signed either way because a recount can be
  wrong in either direction. Zero and non-integer quantities are rejected. A
  mismatch is `422 validation` with `fields.qty`, and writes nothing.
- A movement that would drive stock below zero → `422 validation`, with the
  amount on hand in `message`. The stock screen relies on this message. The
  level move itself is a conditional `$inc` ("on hand must cover this removal")
  evaluated atomically, so it cannot clobber a concurrent sale's decrement.
- `target: "product"` requires `stockMode: "direct"`. A recipe product has no
  stock of its own to adjust.
- `label` should be denormalised onto the movement (the ingredient or product
  name at that moment) so the ledger reads correctly after a rename.

```jsonc
// GET /api/stock/value
{ "ingredientsValue": 1741160, "retailValue": 3811000, "total": 5552160 }
```

`ingredientsValue` is at unit cost; `retailValue` is packaged stock at **selling**
price. They are reported separately and only summed for a rough figure — the UI
labels the combined number "treat as an order of magnitude", and that labelling
should survive into the API consumer.

## 8. Users

`UserRepository`

| Method | Endpoint |
|---|---|
| `list()` | `GET /api/users` |
| `create(input)` | `POST /api/users` → `201` |
| `update(id, input)` | `PUT /api/users/:id` |
| `setActive(id, isActive)` | `PATCH /api/users/:id/active` |
| `authenticate(u, p)` | `POST /api/auth/login` |

```jsonc
UserInput { name, username, role, isActive, password? }
// password required on create; on update, absent or empty means unchanged
User      { id, name, username, role, isActive }   // never a password field
```

Server rules:

- **Usernames unique case-insensitively.** `409 username-taken`.
- **`409 last-active-admin`** when deactivating the last active admin. Without
  this the app can be left with no account that can reach user management.
- **No delete endpoint.** Orders reference the cashier by id; deactivation is how
  someone leaves.

`list` is silently capped at **1000 rows** (`USER_LIST_CAP`). Staff lists stay
small; the cap only guards against an unbounded array.

## 9. Orders

`OrderRepository`

| Method | Endpoint |
|---|---|
| `list(query)` | `GET /api/orders?cashierId&from&to` |
| `getById(id)` | `GET /api/orders/:id` |
| `recent(limit)` | `GET /api/orders/recent?limit=8` |
| `create(input)` | `POST /api/orders` → `201` |

```jsonc
// POST /api/orders
{
  "lines": [{ "productId": "p-iced-americano", "qty": 2 }],
  "paymentMethod": "cash" | "qris" | "debit" | "credit",
  "paidAmount": 70400,
  // optional; null/omitted for a walk-in sale
  "customer": {
    "name": "Dewi Lestari",
    "phone": "6281234501122",
    "email": null              // string or null
  }
  // cashier is taken from the session and ignored in the body
}
```

```jsonc
// 201
{
  "order": Order,
  "movements": [StockMovement, ...]   // the stock this sale consumed
}
```

### The one endpoint that must be a real transaction

Inside a single MongoDB transaction:

0. The cashier must have an **open shift**. No open shift →
   `409 conflict` reason `no-open-shift`, nothing written. This applies to
   **every role, admins included** — an admin's cash sale misses the drawer
   count just as badly as a cashier's.
1. Re-read every line's product. Reject unknown ids, and reject an inactive
   product with `422 validation` naming it: a tab left open from before the
   change must not sell something the menu has hidden.
2. Recompute `subtotal`, `taxAmount` (PPN 10%, rounded to whole rupiah), and
   `total` from stored prices. **Never trust a total from the client.** A
   `paidAmount` below the computed total is `422 validation` with
   `fields.paidAmount`; stock and the receipt counter stay untouched.
3. Validate coverage. A `direct` product needs `stock >= qty`; a `recipe` product
   needs every ingredient to cover `recipe.qty × qty`. Otherwise →
   `409 insufficient-stock`, naming the short ingredient.
4. Assign the next `receiptNo` (`MOKA-####`).
5. Write the order with denormalised lines and the `shiftId` of the open shift
   it was sold under (historical — a later close never rewrites it).
6. Decrement stock and append the movements.
7. Insert the idempotency key, if one was supplied, in the same transaction.

If any step fails, **nothing is written.** This mirrors what the mock does with
its snapshot-and-restore `mutate`, and the reason the until's stock numbers can
be trusted. A partial write here means a receipt exists for stock that was never
sold, or stock was consumed by an order that does not exist.

### Gross revenue in the breakdowns

`order.total` is gross — it includes PPN — while `line.price × line.qty` is
pre-tax. Category and product report rows must allocate the order total in
proportion to those line weights, giving leftover rupiah to the largest
fractional shares. Summing line prices instead made every breakdown understate
revenue by that order's tax; proportional allocation makes the category and
product totals equal the KPI revenue exactly, with no lost or invented rupiah.
This is implemented in `src/lib/repositories/read-models.ts`
(`allocateGrossRevenue`).

### `from` / `to` are inclusive, `yyyy-mm-dd`

`to` must cover the whole day. The mock had to special-case this: parsed as a bare
date a `to` lands at midnight, so a range ending today silently drops that day's
sales. Apply `<= to 23:59:59.999` or translate to `< to+1day`.

Both bounds are resolved in the **store's** timezone (`STORE_TIMEZONE`, returned
as `storeTimezone` by `GET /api/config`), not the server's or browser's. In
Asia/Jakarta, a sale at 23:30 local is 16:30 UTC the same day and must fall in
that day's range. The frontend adopts the zone this endpoint advertises for all
of its own day-key math (`adoptStoreTimezone` in `report-math.ts`), with the
build-time `NEXT_PUBLIC_STORE_TIMEZONE` as fallback only — so a change to the
backend's zone keeps working without a frontend redeploy. The dashboard asks
for today plus the previous six store days, and both day and month trend
buckets use the same calendar.

### Idempotency

Accept an `Idempotency-Key` header on `POST /api/orders`. A mobile till on flaky
wifi will retry, and a retry that creates a second receipt is a real-world
duplicate charge.

- The first request writes the order and the key together, and answers `201`.
- A replay answers `200` with the original `order`, an empty `movements` array
  (the ledger has its own endpoint), and `Idempotent-Replay: true`.
- A blank header is treated as absent, so two deliberate sales are still two
  sales.
- Concurrent retries of one key race on the unique key index; the loser returns
  the winner's receipt rather than charging twice.
- Replaying does not decrement stock again.
- A key is owned by the (shift, teller) combination that produced it: replaying
  a key with a body that binds it to a different cashier or shift answers
  `409 conflict` reason `idempotency-key-foreign` rather than handing over a
  receipt that is not the caller's.

### Voiding a receipt

`POST /api/orders/:id/void` — admin only. The request must carry a `reason` of
at least three characters (`422 validation` otherwise: a void is an audit act,
not a rubber stamp). It answers `200` with `{ order, movements, warnings }`:
the receipt is marked `voided`, its stock is restored with ledger rows of type
`void` appended — all inside one transaction, the same "or not at all" rule the
sale kept — and `warnings` carries anything the restore could not fully do, so
the admin never finds out after digging through the response. A second void
refuses with `409 conflict` reason `order-already-voided`. Voided receipts drop
out of every revenue aggregate; the transactions screen remains the view of
  what was reversed, which is why their ledger notes carry the reason.

## 10. Reports

`ReportsRepository`

| Method | Endpoint |
|---|---|
| `sales(from, to, filter?)` | `GET /api/reports/sales?from&to[&method][&q]` |

```jsonc
// 200
{
  "from": "2026-10-01",          // echoed, inclusive store-calendar days
  "to": "2026-10-23",
  "kpi": {
    "revenue": 4500000,           // gross; PPN included
    "transactions": 84,
    "averageOrderValue": 53571,
    "itemsSold": 213,
    "withCustomer": 9              // receipts carrying a customer phone
  },
  "paymentBreakdown": [{ "method": "cash", "count": 40, "total": 2100000 }],
  "trend": {
    "bucket": "day" | "month",    // months once the span passes ~31 days
    "points": [{ "date": "2026-10-01", "revenue": 0, "transactions": 0 }]
  },
  "byCategory": [{ "categoryId": "coffee", "categoryName": "Coffee", "revenue": 1800000, "itemsSold": 90 }],
  "topProducts": [{ "productId": "p-iced-latte", "name": "Iced Latte", "quantity": 15, "revenue": 512000 }],
  "byCashier": [{ "cashierId": "u-2", "cashierName": "Siti Rahayu", "transactions": 27, "revenue": 1400000, "averageOrderValue": 51852, "itemsSold": 61 }]
}
```

Server rules:

- **`from` and `to` are required** — a report never quietly defaults to a
  window. Long spans intentionally get "all time": the transactions screen asks
  from an explicit named earliest day (`2000-01-01`) and the aggregate answers
  month buckets for it.
- **Only paid receipts count.** A void was never a sale; the transactions
  screen is the audit view of reversals.
- `method` narrows by payment method; `q` is the same customer-facing needle
  the order list applies (receipt no., customer name; phone only when the
  needle carries digits). The tiles must answer the same question the ledger
  table under them lists, so both take the identical filter.
- `kpi.withCustomer` counts paid receipts with a customer phone — the till
  labels it "can be sent", since WhatsApp needs the phone.
- Breakdown `revenue` values are **gross** (see the allocation rule above for
  how client-side category/product splits stay equal to KPI revenue).
- Both roles may read; no reads here are secret, and a kasir's own till shows
  the day's takings already. Writes never happen through this route.

## 11. Shifts

`ShiftRepository` — a shift **gates selling**: `POST /api/orders` refuses with
`409 no-open-shift` until the cashier has one open, and closing one reconciles
the drawer.

| Method | Endpoint |
|---|---|
| `current(userId)` | `GET /api/shifts/current` |
| `list(query)` | `GET /api/shifts?cashierId` |

`list` is silently capped at **1000 rows** (`SHIFT_LIST_CAP`) — history for
reporting, still without pagination.
| `open(input)` | `POST /api/shifts` → `201` |
| `close(id, counted)` | `POST /api/shifts/:id/close` |

```jsonc
Shift { id, userId, userName, openedAt, openingFloat, closedAt | null,
        closingCounted | null, status: "open" | "closed",
        // reconciliation — filled in at close, null while open
        cashSales | null, expectedCash | null, variance | null }
```

- `409 already-open-shift` when the user has one open.
- `409 already-closed-shift` on double close.
- `403 forbidden` when a non-admin tries to close someone else's shift. Admins
  may close any shift (a manager closing a till at end of day).
- `userId` / `cashier.id` come from the session.

### Cash reconciliation

Closing computes, from data the server owns:

- `cashSales` — sum of `total` on orders with `paymentMethod: "cash"` and this
  `shiftId`. Non-cash takings never touch the drawer, so they are excluded.
- `expectedCash` — `openingFloat + cashSales`.
- `variance` — `counted − expectedCash`. Negative is short; positive is over.

These three are **stored on the shift at close time**, not recomputed on read:
the figures are what the drawer was judged against when it was counted, and a
later edit to history must not change yesterday's variance. The close response
is the closed `Shift` including all three, so the UI can show the result without
a second round-trip.

## 12. Suggested MongoDB shape

```
users            { _id, name, username, passwordHash, role, isActive, createdAt }
                 unique index on username (case-insensitive)

categories       { _id, name, sortOrder }

ingredients      { _id, name, unit, stock, minStock, costPerUnit }

products         { _id, name, categoryId, price, image, stockMode,
                   stock?, minStock?, recipe: [{ ingredientId, qty }], isActive }
                 index on categoryId, on isActive

orders           { _id, receiptNo, lines: [{ productId, name, price, qty, stockMode }],
                   subtotal, taxRate, taxAmount, total, paymentMethod,
                   paidAmount, changeAmount, cashierId, cashierName, shiftId,
                   customer: { name, phone, email } | null,
                   createdAt }
                 unique index on receiptNo
                 index on createdAt (the reports range-scan it)
                 index on cashierId
                 index on shiftId (reconciliation sums cash sales per shift)
                 NO index on lines.productId — lines are embedded and never joined

stock_movements  { _id, type, ingredientId?, productId?, label, qty, unit,
                   note, createdAt, byUserId, byUserName }
                 index on createdAt desc, on ingredientId, on productId

shifts           { _id, userId, userName, openedAt, openingFloat,
                   closedAt?, closingCounted?, status,
                   cashSales?, expectedCash?, variance? }
                 index on { userId, status }
```

Order lines are embedded on purpose. A receipt must be printable without a join,
and the historical price requirement means the line is a snapshot, not a
reference.

Note there is **no inventory collection**. `Ingredient.stock` and direct-product
`Product.stock` are current levels on their own documents; `stock_movements` is the
history. The ledger is the audit trail, not the source of truth.

## 13. What the frontend does not need from the server

Stated explicitly so nobody builds it:

- **Totals, taxes, margins, servings** — computed in
  `lib/repositories/read-models.ts` and `types/pos.ts` from returned data. Only
  `StockRepository.value()` is a server call, because it multiplies levels by
  costs.
- **Sorting, pagination, filtering UI** — mostly client-side. The one server-side
  exception is the stock movement ledger: `GET /api/stock/movements` accepts
  `limit`/`offset` and returns `{ data, total, limit, offset }` (section 7),
  because that history is the only list that grows without bound. General
  pagination stays client-side; when it moves server-side, that logic goes in
  the repository, not in the screens.
- **The dashboard and report aggregations** — the frontend already sums, trends,
  and splits. Moving them server-side is a performance option, not a requirement.
- **Route-level guards** — the client keeps its own; the server just has to
  agree.

## 14. Acceptance for the swap

The API was done when:

1. A new implementation of the nine interfaces returns real data.
2. `getRepositories()` points at it. **That is the only file changed.** — 27 lines
   in `index.ts`.
3. `npm run smoke` passes unchanged.

**All three met.** At the time of the swap, 182/182 checks passed against the
live API. The suite has grown since — every remediation added its own cases
(rate limits, paged movements, transactional edits, atomic adjustments) and the
README's "Verified after the latest edits" section carries the current count.

Point 3 is the real test. It covers catalogue CRUD, stock adjustments and their
refusals, the ledger, a full sale through to the receipt, report ranges and CSV,
account creation and deactivation, the role gate, and the print layout — against
whatever the API does. No screen was edited, which is the evidence that the
abstraction held.

What *did* change was test setup, and it is worth recording: five suites used to
clear `moka-pos.auth` from `localStorage` to sign out. The session is now an
httpOnly cookie that the page cannot read or clear, so those suites call
`POST /api/auth/logout`. The application contract was unaffected; only the tests
had to learn the new mechanism.